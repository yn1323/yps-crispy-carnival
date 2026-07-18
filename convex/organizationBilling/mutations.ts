import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { authenticatedMutation } from "../_lib/functions";
import { requireOrganizationActorForShop } from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import {
  getOrganizationBillingState,
  getOrganizationUsageSnapshot,
  removeLegacyOrganizationManagerAccess,
} from "../organization/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { scheduleOrganizationBillingStateDeadline } from "./deadline";
import {
  createPaymentGraceState,
  decideScheduledTransition,
  evaluateFreeEligibility,
  evaluatePlanLimits,
  getEffectiveRestrictedBillingState,
  isVerifiedBillingTransitionAllowed,
  type OrganizationBillingState,
  type OrganizationPersonUsageInput,
  projectFreeUsage,
  projectOrganizationUsage,
} from "./policy";
import { requireRestrictedRecoveryCapability } from "./service";

const transitionResultValidator = v.object({
  changed: v.boolean(),
  stateKind: v.optional(v.string()),
});

const GRACE_ENDING_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

async function getBillingRecipientUserIds(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  state?: OrganizationBillingState,
) {
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
    .collect();
  const recoveryPersonIds = new Set(
    state ? getEffectiveRestrictedBillingState(state)?.recoveryManagerPersonIds : undefined,
  );
  return [
    ...new Set(
      members
        .filter(
          (member) =>
            member.status === "active" || (member.status === "readOnly" && recoveryPersonIds.has(member.personId)),
        )
        .map((member) => member.userId),
    ),
  ];
}

async function userIdsForPeople(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  personIds: readonly Id<"organizationPeople">[],
) {
  const requested = new Set(personIds);
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
    .collect();
  return members.filter((member) => requested.has(member.personId)).map((member) => member.userId);
}

function previousPlan(state: OrganizationBillingState): "free" | "pro" | "business" | undefined {
  switch (state.kind) {
    case "active":
      return state.plan;
    case "complimentary":
      return "business";
    case "scheduledChange":
      return state.currentPlan;
    case "initialPaymentPending":
    case "pendingActivation":
    case "grace":
      return state.plan;
    case "restricted":
      return state.previousPlan;
    case "trial":
      return undefined;
  }
}

async function getPersonUsageInputs(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const [people, members] = await Promise.all([
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organizationId))
      .collect(),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
      .collect(),
  ]);
  const memberByPersonId = new Map(members.map((member) => [member.personId, member]));
  const inputs: OrganizationPersonUsageInput[] = [];
  for (const person of people) {
    const staff = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", organizationId).eq("organizationPersonId", person._id),
      )
      .first();
    const member = memberByPersonId.get(person._id);
    inputs.push({
      personId: person._id,
      isActiveInOrganization: person.status === "active",
      isStaff: Boolean(staff),
      managerRole: member?.status === "active" ? "active" : member?.status === "readOnly" ? "readOnly" : "none",
    });
  }
  return { people, members, inputs };
}

async function getValidManagerRelationship(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    person: Doc<"organizationPeople"> | null | undefined;
    members: Doc<"organizationMembers">[];
    allowedStatuses: ReadonlySet<Doc<"organizationMembers">["status"]>;
  },
) {
  if (
    !args.person ||
    args.person.organizationId !== args.organizationId ||
    args.person.status !== "active" ||
    !args.person.userId ||
    args.members.length !== 1
  ) {
    return null;
  }
  const member = args.members[0];
  if (
    member.organizationId !== args.organizationId ||
    member.personId !== args.person._id ||
    member.userId !== args.person.userId ||
    !args.allowedStatuses.has(member.status)
  ) {
    return null;
  }
  const user = await ctx.db.get(member.userId);
  if (!user || user.isDeleted) return null;
  return { person: args.person, member, user };
}

async function revokePendingManagerInvitations(ctx: MutationCtx, organizationId: Id<"organizations">, now: number) {
  const invitations = await collectIssuedInvitationsByOrganization(ctx, organizationId);
  for (const invitation of invitations) {
    await ctx.db.patch(invitation._id, {
      status: "revoked",
      revokedAt: now,
      reservedSeat: false,
      version: invitation.version + 1,
      updatedAt: now,
    });
  }
}

function paidActivationNeedsExplicitRestoration(state: OrganizationBillingState): boolean {
  return (
    state.kind === "restricted" ||
    state.kind === "pendingActivation" ||
    (state.kind === "active" && state.plan === "free")
  );
}

async function applyVerifiedPaidRestoration(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    plan: "pro" | "business";
    currentState: OrganizationBillingState;
    restoreManagerPersonIds?: Id<"organizationPeople">[];
    restoreShopIds?: Id<"shops">[];
    now: number;
  },
) {
  const needsExplicitRestoration = paidActivationNeedsExplicitRestoration(args.currentState);
  const hasManagerSelection = args.restoreManagerPersonIds !== undefined;
  const hasShopSelection = args.restoreShopIds !== undefined;
  if (needsExplicitRestoration && (!hasManagerSelection || !hasShopSelection)) {
    throw new ConvexError("再開する管理者と店舗を確認してください");
  }
  if (!needsExplicitRestoration && (hasManagerSelection || hasShopSelection)) {
    throw new ConvexError("現在の契約状態では復旧対象を指定できません");
  }

  if (!needsExplicitRestoration) {
    const usage = await getOrganizationUsageSnapshot(ctx, args.organizationId);
    const eligibility = evaluatePlanLimits(args.plan, {
      peopleCount: usage.projectedPersonCount,
      activeManagerCount: usage.projectedActiveManagerCount,
      activeShopCount: usage.activeShopCount,
    });
    if (!eligibility.withinLimits) throw new ConvexError("復旧後の利用状況がプラン上限を超えます");
    return;
  }

  const managerPersonIds = args.restoreManagerPersonIds ?? [];
  const shopIds = args.restoreShopIds ?? [];
  if (new Set(managerPersonIds).size !== managerPersonIds.length || new Set(shopIds).size !== shopIds.length) {
    throw new ConvexError("復旧対象が重複しています");
  }
  if (managerPersonIds.length === 0) throw new ConvexError("再開する管理者を一名以上選んでください");

  const [{ people, members, inputs }, shops, usage] = await Promise.all([
    getPersonUsageInputs(ctx, args.organizationId),
    ctx.db
      .query("shops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect(),
    getOrganizationUsageSnapshot(ctx, args.organizationId),
  ]);
  const personById = new Map(people.map((person) => [person._id, person]));
  const membersByPersonId = new Map<Id<"organizationPeople">, Doc<"organizationMembers">[]>();
  for (const member of members) {
    const personMembers = membersByPersonId.get(member.personId) ?? [];
    personMembers.push(member);
    membersByPersonId.set(member.personId, personMembers);
  }
  const selectedManagerIds = new Set<string>(managerPersonIds);
  for (const personId of managerPersonIds) {
    const relationship = await getValidManagerRelationship(ctx, {
      organizationId: args.organizationId,
      person: personById.get(personId),
      members: membersByPersonId.get(personId) ?? [],
      allowedStatuses: new Set(["active", "readOnly"]),
    });
    if (!relationship) {
      throw new ConvexError("再開する管理者を確認できません");
    }
  }

  const shopById = new Map(shops.map((shop) => [shop._id, shop]));
  const selectedShopIds = new Set(shopIds);
  for (const shopId of shopIds) {
    const shop = shopById.get(shopId);
    if (!shop || shop.organizationId !== args.organizationId || shop.isDeleted || shop.operatingStatus === "archived") {
      throw new ConvexError("再開する店舗を確認できません");
    }
  }

  const projection = projectOrganizationUsage({
    people: inputs.map((input) => ({
      ...input,
      managerRole: selectedManagerIds.has(input.personId) ? ("active" as const) : ("readOnly" as const),
    })),
    reservedPersonCount: usage.reservedSeatCount,
  });
  const eligibility = evaluatePlanLimits(args.plan, {
    peopleCount: projection.projectedPeopleCount,
    activeManagerCount: managerPersonIds.length + usage.pendingManagerInvitationCount,
    activeShopCount: shopIds.length,
  });
  if (!eligibility.withinLimits) throw new ConvexError("復旧後の利用状況がプラン上限を超えます");

  for (const member of members) {
    if (member.status === "removed") continue;
    const targetStatus = selectedManagerIds.has(member.personId) ? "active" : "readOnly";
    if (member.status !== targetStatus) await ctx.db.patch(member._id, { status: targetStatus, updatedAt: args.now });
  }
  for (const shop of shops) {
    if (shop.isDeleted || shop.operatingStatus === "archived") continue;
    const targetStatus = selectedShopIds.has(shop._id) ? "active" : "planSuspended";
    if (shop.operatingStatus !== targetStatus) await ctx.db.patch(shop._id, { operatingStatus: targetStatus });
  }
}

async function applyFreeOrRestricted(
  ctx: MutationCtx,
  args: {
    billingState: Doc<"organizationBillingStates">;
    restrictionReason: "trialFreeConditionsNotMet" | "freeConditionsNotMet";
    now: number;
    actorUserId?: Id<"users">;
    actorPersonId?: Id<"organizationPeople">;
    correlationId: string;
  },
) {
  const { billingState, now } = args;
  const organizationId = billingState.organizationId;
  const { people, members, inputs } = await getPersonUsageInputs(ctx, organizationId);
  const transitionRecipientUserIds = await getBillingRecipientUserIds(ctx, organizationId, billingState.state);
  const personById = new Map(people.map((person) => [person._id, person]));
  const membersByPersonId = new Map<Id<"organizationPeople">, Doc<"organizationMembers">[]>();
  for (const member of members) {
    const personMembers = membersByPersonId.get(member.personId) ?? [];
    personMembers.push(member);
    membersByPersonId.set(member.personId, personMembers);
  }
  const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
  const recoveryManagerPersonIds = new Set(
    restrictedState ? restrictedState.recoveryManagerPersonIds : ([] as Id<"organizationPeople">[]),
  );
  const candidateManagerPersonIds = restrictedState
    ? restrictedState.recoveryManagerPersonIds
    : members.filter((member) => member.status === "active").map((member) => member.personId);
  const sourceManagerPersonIds: Id<"organizationPeople">[] = [];
  for (const personId of new Set(candidateManagerPersonIds)) {
    const relationship = await getValidManagerRelationship(ctx, {
      organizationId,
      person: personById.get(personId),
      members: membersByPersonId.get(personId) ?? [],
      allowedStatuses: restrictedState ? new Set(["active", "readOnly"]) : new Set(["active"]),
    });
    if (relationship) sourceManagerPersonIds.push(personId);
  }
  const selectedManagerId = billingState.freeManagerPersonId;
  const selectedManagerIsValid = Boolean(
    selectedManagerId &&
      sourceManagerPersonIds.includes(selectedManagerId) &&
      personById.get(selectedManagerId)?.status === "active",
  );

  const allOrganizationShops = await ctx.db
    .query("shops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .collect();
  const sourceShopIds = restrictedState
    ? restrictedState.previousActiveShopIds.filter((shopId) => {
        const shop = allOrganizationShops.find((candidate) => candidate._id === shopId);
        return shop && !shop.isDeleted && shop.operatingStatus !== "archived";
      })
    : allOrganizationShops
        .filter((shop) => !shop.isDeleted && shop.operatingStatus === "active")
        .map((shop) => shop._id);
  const requestedShopId = billingState.freeShopId;
  const selectedShopId = requestedShopId
    ? sourceShopIds.includes(requestedShopId)
      ? requestedShopId
      : undefined
    : sourceShopIds.length === 1
      ? sourceShopIds[0]
      : undefined;
  const shopSelectionIsResolved = sourceShopIds.length === 0 || selectedShopId !== undefined;

  const projectedInputs = inputs.map((input) => ({
    ...input,
    managerRole:
      selectedManagerIsValid && input.personId === selectedManagerId
        ? ("active" as const)
        : sourceManagerPersonIds.some((personId) => personId === input.personId)
          ? ("readOnly" as const)
          : input.managerRole,
  }));
  const freeProjection = projectFreeUsage(projectedInputs, selectedManagerIsValid ? (selectedManagerId ?? null) : null);
  const eligibility = evaluateFreeEligibility({
    peopleCount: freeProjection.projectedPeopleCount,
    activeManagerCount: selectedManagerIsValid ? 1 : 0,
    activeShopCount: shopSelectionIsResolved ? (selectedShopId ? 1 : 0) : sourceShopIds.length,
  });

  const nextState: OrganizationBillingState = eligibility.eligible
    ? { kind: "active", plan: "free" }
    : {
        kind: "restricted",
        reason: args.restrictionReason,
        previousPlan: restrictedState?.previousPlan ?? previousPlan(billingState.state),
        recoveryManagerPersonIds:
          selectedManagerIsValid && selectedManagerId ? [selectedManagerId] : sourceManagerPersonIds,
        previousActiveShopIds: restrictedState ? restrictedState.previousActiveShopIds : sourceShopIds,
        restrictedAt: now,
      };

  if (shopSelectionIsResolved) {
    for (const shopId of sourceShopIds) {
      const shop = allOrganizationShops.find((candidate) => candidate._id === shopId);
      if (!shop) continue;
      const targetStatus = shopId === selectedShopId ? "active" : "planSuspended";
      if (shop.operatingStatus !== targetStatus) await ctx.db.patch(shop._id, { operatingStatus: targetStatus });
    }
  }

  if (selectedManagerIsValid && selectedManagerId) {
    for (const member of members) {
      if (member.status === "removed") continue;
      const isTransitionManager =
        nextState.kind === "active"
          ? member.status === "active" || member.status === "readOnly"
          : restrictedState
            ? recoveryManagerPersonIds.has(member.personId)
            : member.status === "active";
      if (!isTransitionManager) continue;

      const targetStatus =
        member.personId === selectedManagerId ? "active" : nextState.kind === "active" ? "removed" : "readOnly";
      if (member.status === targetStatus) continue;
      await ctx.db.patch(member._id, { status: targetStatus, updatedAt: now });
      if (targetStatus !== "removed") continue;

      await removeLegacyOrganizationManagerAccess(ctx, organizationId, member.userId);
      const activeStaff = await ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", organizationId).eq("organizationPersonId", member.personId),
        )
        .filter((q) => q.eq(q.field("isDeleted"), false))
        .first();
      await recordOrganizationAuditEvent(ctx, {
        organizationId,
        actorUserId: args.actorUserId,
        actorPersonId: args.actorPersonId,
        action: "organization.manager_role_removed",
        targetKind: "person",
        targetId: member.personId,
        fromState: member.status,
        toState: activeStaff ? "staffOnly" : "personOnly",
        correlationId: `${args.correlationId}:manager-role-removed:${member._id}`,
        occurredAt: now,
      });
    }
  }

  // すでに契約制限中でFree条件を満たせない再評価は、新たな「制限開始」ではない。
  // 選択値と人物・店舗の絞り込みは呼び出し元のversionで確定済みなので、制限開始時の副作用を再発行しない。
  if (restrictedState && nextState.kind === "restricted") {
    if (
      selectedManagerIsValid &&
      selectedManagerId &&
      (restrictedState.recoveryManagerPersonIds.length !== 1 ||
        restrictedState.recoveryManagerPersonIds[0] !== selectedManagerId)
    ) {
      await ctx.db.patch(billingState._id, {
        state:
          billingState.state.kind === "pendingActivation"
            ? {
                ...billingState.state,
                restrictedFallbackState: {
                  ...restrictedState,
                  recoveryManagerPersonIds: [selectedManagerId],
                },
              }
            : { ...restrictedState, recoveryManagerPersonIds: [selectedManagerId] },
      });
    }
    return { changed: true, stateKind: billingState.state.kind };
  }

  if (billingState.state.kind === "pendingActivation" && restrictedState && nextState.kind === "active") {
    await ctx.db.patch(billingState._id, {
      state: {
        kind: "pendingActivation",
        plan: billingState.state.plan,
        fallback: "free",
        startedAt: billingState.state.startedAt,
      },
    });
    return { changed: true, stateKind: "pendingActivation" };
  }

  const nextVersion = billingState.version + 1;
  await ctx.db.patch(billingState._id, {
    state: nextState,
    freeManagerPersonId: selectedManagerIsValid ? selectedManagerId : billingState.freeManagerPersonId,
    freeShopId: shopSelectionIsResolved ? selectedShopId : billingState.freeShopId,
    businessNotificationCutoffAt: now,
    businessNotificationCutoffVersion: nextVersion,
    version: nextVersion,
    updatedAt: now,
  });
  await revokePendingManagerInvitations(ctx, organizationId, now);
  await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
    organizationId,
    cutoffAt: now,
    cutoffVersion: nextVersion,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId,
    actorUserId: args.actorUserId,
    actorPersonId: args.actorPersonId,
    action: "organization.billing_state_changed",
    targetKind: "billing",
    targetId: billingState._id,
    fromState: billingState.state.kind,
    toState: nextState.kind === "active" ? "free" : "restricted",
    correlationId: args.correlationId,
    occurredAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
    organizationId,
    event: nextState.kind === "active" ? "freeApplied" : "restrictedStarted",
    eventKey: args.correlationId,
    recipientUserIds: transitionRecipientUserIds,
  });
  return { changed: true, stateKind: nextState.kind === "active" ? "free" : "restricted" };
}

async function resolvePendingActivationFailure(
  ctx: MutationCtx,
  billingState: Doc<"organizationBillingStates">,
  now: number,
): Promise<{
  state: OrganizationBillingState;
  event: "paidActivationFailedFreeContinued" | "paidActivationFailedRestrictedContinued";
}> {
  if (billingState.state.kind !== "pendingActivation") {
    throw new ConvexError("現在の契約状態からこの変更は適用できません");
  }
  if (billingState.state.fallback === "restricted") {
    if (!billingState.state.restrictedFallbackState) {
      throw new ConvexError("契約制限中の復旧情報を確認できません");
    }
    return {
      state: billingState.state.restrictedFallbackState,
      event: "paidActivationFailedRestrictedContinued",
    };
  }

  const { people, members } = await getPersonUsageInputs(ctx, billingState.organizationId);
  const personById = new Map(people.map((person) => [person._id, person]));
  const membersByPersonId = new Map<Id<"organizationPeople">, Doc<"organizationMembers">[]>();
  for (const member of members) {
    const personMembers = membersByPersonId.get(member.personId) ?? [];
    personMembers.push(member);
    membersByPersonId.set(member.personId, personMembers);
  }
  const activeMemberRows = members.filter((member) => member.status === "active");
  const validActiveManagerPersonIds: Id<"organizationPeople">[] = [];
  for (const personId of new Set(activeMemberRows.map((member) => member.personId))) {
    const relationship = await getValidManagerRelationship(ctx, {
      organizationId: billingState.organizationId,
      person: personById.get(personId),
      members: membersByPersonId.get(personId) ?? [],
      allowedStatuses: new Set(["active"]),
    });
    if (relationship) validActiveManagerPersonIds.push(personId);
  }
  const activeShops = (
    await ctx.db
      .query("shops")
      .withIndex("by_organizationId_and_operatingStatus", (q) =>
        q.eq("organizationId", billingState.organizationId).eq("operatingStatus", "active"),
      )
      .collect()
  ).filter((shop) => !shop.isDeleted);

  if (billingState.state.fallback === "free") {
    const usage = await getOrganizationUsageSnapshot(ctx, billingState.organizationId);
    const selectedManagerIsValid = Boolean(
      billingState.freeManagerPersonId &&
        validActiveManagerPersonIds.includes(billingState.freeManagerPersonId) &&
        validActiveManagerPersonIds.length === 1 &&
        activeMemberRows.length === 1,
    );
    const eligibility = evaluateFreeEligibility({
      peopleCount: usage.projectedPersonCount,
      activeManagerCount: selectedManagerIsValid ? 1 : 0,
      activeShopCount: activeShops.length,
    });
    if (eligibility.eligible) {
      return {
        state: { kind: "active", plan: "free" },
        event: "paidActivationFailedFreeContinued",
      };
    }
  }

  return {
    state: {
      kind: "restricted",
      reason: "paymentActivationFailed",
      recoveryManagerPersonIds: validActiveManagerPersonIds,
      previousActiveShopIds: activeShops.map((shop) => shop._id),
      restrictedAt: now,
    },
    event: "paidActivationFailedRestrictedContinued",
  };
}

export const setFreeSelection = authenticatedMutation({
  args: {
    shopId: v.id("shops"),
    managerPersonId: v.union(v.id("organizationPeople"), v.null()),
    freeShopId: v.union(v.id("shops"), v.null()),
    requestId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      allowReadOnly: true,
    });
    const billingState = await getOrganizationBillingState(ctx, actor.organization._id);
    if (!billingState) throw new ConvexError("グループの契約情報を確認中です");
    if (billingState.state.kind === "complimentary") {
      throw new ConvexError("料金なしのBusinessではFree設定を変更できません");
    }
    if (billingState.state.kind === "initialPaymentPending") {
      throw new ConvexError("支払い結果の確認中はFree設定を変更できません");
    }
    if (billingState.state.kind === "pendingActivation" && billingState.state.fallback === "free") {
      throw new ConvexError("支払い結果の確認中はFree設定を変更できません");
    }
    const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
    const canSetFreeSelection =
      billingState.state.kind === "trial" ||
      billingState.state.kind === "scheduledChange" ||
      billingState.state.kind === "grace" ||
      restrictedState !== null ||
      (billingState.state.kind === "active" && billingState.state.plan !== "free");
    if (!canSetFreeSelection) {
      throw new ConvexError("現在の契約状態ではFree設定を変更できません");
    }
    if (restrictedState) {
      await requireRestrictedRecoveryCapability(ctx, {
        organizationId: actor.organization._id,
        personId: actor.person._id,
        capability: "selectFreeManager",
      });
    } else if (actor.member.status !== "active") {
      throw new ConvexError("この操作を行う権限がありません");
    }

    if (args.managerPersonId) {
      const managerPersonId = args.managerPersonId;
      const managerPerson = await ctx.db.get(managerPersonId);
      const managerMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", actor.organization._id).eq("personId", managerPersonId),
        )
        .take(2);
      const canSelectRestrictedRecovery = Boolean(restrictedState?.recoveryManagerPersonIds.includes(managerPersonId));
      const relationship = await getValidManagerRelationship(ctx, {
        organizationId: actor.organization._id,
        person: managerPerson,
        members: managerMembers,
        allowedStatuses: canSelectRestrictedRecovery ? new Set(["active", "readOnly"]) : new Set(["active"]),
      });
      if (!relationship) {
        throw new ConvexError("Freeで残す管理者を確認できません");
      }
    }
    if (args.freeShopId) {
      const freeShop = await ctx.db.get(args.freeShopId);
      const allowedRestrictedShop = restrictedState?.previousActiveShopIds.includes(args.freeShopId);
      if (
        !freeShop ||
        freeShop.organizationId !== actor.organization._id ||
        freeShop.isDeleted ||
        (freeShop.operatingStatus !== "active" && !allowedRestrictedShop)
      ) {
        throw new ConvexError("Freeで残す店舗を確認できません");
      }
    }

    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId = `${actor.organization._id}:free-selection:${requestKey}`;
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

    const now = Date.now();
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      freeManagerPersonId: args.managerPersonId ?? undefined,
      freeShopId: args.freeShopId ?? undefined,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.free_selection_changed",
      targetKind: "billing",
      targetId: billingState._id,
      correlationId,
      occurredAt: now,
    });
    const updatedBillingState = {
      ...billingState,
      freeManagerPersonId: args.managerPersonId ?? undefined,
      freeShopId: args.freeShopId ?? undefined,
      version: nextVersion,
      updatedAt: now,
    };
    if (getEffectiveRestrictedBillingState(updatedBillingState.state)) {
      return await applyFreeOrRestricted(ctx, {
        billingState: updatedBillingState,
        restrictionReason: "freeConditionsNotMet",
        now,
        actorUserId: actor.member.userId,
        actorPersonId: actor.person._id,
        correlationId: `${correlationId}:evaluate`,
      });
    }
    await scheduleOrganizationBillingStateDeadline(ctx, updatedBillingState);
    return { changed: true, stateKind: updatedBillingState.state.kind };
  },
});

export const processDeadline = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedDeadlineAt: v.number(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState) return { changed: false };
    const decision = decideScheduledTransition({
      state: billingState.state,
      currentVersion: billingState.version,
      expectedVersion: args.expectedVersion,
      expectedDeadlineAt: args.expectedDeadlineAt,
      now: Date.now(),
    });
    if (!decision.shouldApply) return { changed: false, stateKind: billingState.state.kind };
    const now = Date.now();
    const correlationId = `${billingState._id}:deadline:${billingState.version}`;

    if (billingState.state.kind === "trial") {
      if (billingState.state.selectedPaidPlan) {
        const nextState = {
          kind: "initialPaymentPending" as const,
          plan: billingState.state.selectedPaidPlan,
          startedAt: now,
        };
        await ctx.db.patch(billingState._id, {
          state: nextState,
          version: billingState.version + 1,
          updatedAt: now,
        });
        await recordOrganizationAuditEvent(ctx, {
          organizationId: billingState.organizationId,
          action: "organization.billing_state_changed",
          targetKind: "billing",
          targetId: billingState._id,
          fromState: "trial",
          toState: "initialPaymentPending",
          correlationId,
          occurredAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
          organizationId: billingState.organizationId,
          event: "initialPaymentPending",
          eventKey: correlationId,
        });
        return { changed: true, stateKind: "initialPaymentPending" };
      }
      return await applyFreeOrRestricted(ctx, {
        billingState,
        restrictionReason: "trialFreeConditionsNotMet",
        now,
        correlationId,
      });
    }

    if (billingState.state.kind === "grace") {
      const activeManagers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", billingState.organizationId).eq("status", "active"),
        )
        .collect();
      const activeShops = await ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", billingState.organizationId).eq("isDeleted", false),
        )
        .filter((q) => q.eq(q.field("operatingStatus"), "active"))
        .collect();
      const nextState: OrganizationBillingState = {
        kind: "restricted",
        reason: "paymentGraceExpired",
        previousPlan: billingState.state.plan,
        recoveryManagerPersonIds: activeManagers.map((member) => member.personId),
        previousActiveShopIds: activeShops.map((shop) => shop._id),
        restrictedAt: now,
      };
      const nextVersion = billingState.version + 1;
      await ctx.db.patch(billingState._id, {
        state: nextState,
        businessNotificationCutoffAt: now,
        businessNotificationCutoffVersion: nextVersion,
        version: nextVersion,
        updatedAt: now,
      });
      await revokePendingManagerInvitations(ctx, billingState.organizationId, now);
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId: billingState.organizationId,
        cutoffAt: now,
        cutoffVersion: nextVersion,
      });
      await recordOrganizationAuditEvent(ctx, {
        organizationId: billingState.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: billingState._id,
        fromState: "grace",
        toState: "restricted",
        correlationId,
        occurredAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: billingState.organizationId,
        event: "restrictedStarted",
        eventKey: correlationId,
        recipientUserIds: activeManagers.map((member) => member.userId),
      });
      return { changed: true, stateKind: "restricted" };
    }

    if (billingState.state.kind === "scheduledChange") {
      if (billingState.state.targetPlan === "free") {
        return await applyFreeOrRestricted(ctx, {
          billingState,
          restrictionReason: "freeConditionsNotMet",
          now,
          correlationId,
        });
      }
      const usage = await getOrganizationUsageSnapshot(ctx, billingState.organizationId);
      const proEligibility = evaluatePlanLimits("pro", {
        peopleCount: usage.projectedPersonCount,
        activeManagerCount: usage.projectedActiveManagerCount,
        activeShopCount: usage.activeShopCount,
      });
      const nextPlan = proEligibility.withinLimits ? "pro" : "business";
      await ctx.db.patch(billingState._id, {
        state: { kind: "active", plan: nextPlan },
        version: billingState.version + 1,
        updatedAt: now,
      });
      await recordOrganizationAuditEvent(ctx, {
        organizationId: billingState.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: billingState._id,
        fromState: "scheduledChange",
        toState: nextPlan,
        correlationId,
        occurredAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: billingState.organizationId,
        event: proEligibility.withinLimits ? "planActivated" : "proDowngradeNotApplied",
        eventKey: correlationId,
      });
      return { changed: true, stateKind: nextPlan };
    }

    return { changed: false, stateKind: billingState.state.kind };
  },
});

export const setStateFromVerifiedBilling = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    state: v.union(
      v.object({ kind: v.literal("initialPaymentPending"), plan: v.union(v.literal("pro"), v.literal("business")) }),
      v.object({
        kind: v.literal("pendingActivation"),
        plan: v.union(v.literal("pro"), v.literal("business")),
        fallback: v.union(v.literal("free"), v.literal("restricted")),
      }),
      v.object({ kind: v.literal("active"), plan: v.union(v.literal("pro"), v.literal("business")) }),
      v.object({ kind: v.literal("paymentFailed") }),
      v.object({ kind: v.literal("scheduledChangeCanceled") }),
      v.object({
        kind: v.literal("grace"),
        plan: v.union(v.literal("pro"), v.literal("business")),
        firstFailureAt: v.number(),
      }),
      v.object({
        kind: v.literal("scheduledChange"),
        currentPlan: v.union(v.literal("pro"), v.literal("business")),
        targetPlan: v.union(v.literal("free"), v.literal("pro")),
        effectiveAt: v.number(),
      }),
    ),
    correlationId: v.string(),
    restoreManagerPersonIds: v.optional(v.array(v.id("organizationPeople"))),
    restoreShopIds: v.optional(v.array(v.id("shops"))),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

    if (args.state.kind === "grace" && billingState.state.kind === "grace") {
      if (args.state.plan !== billingState.state.plan) {
        throw new ConvexError("支払い猶予中のプランと一致しません");
      }
      return { changed: false, stateKind: "grace" };
    }

    const now = Date.now();
    const priorRecipientUserIds = await getBillingRecipientUserIds(ctx, args.organizationId, billingState.state);
    let nextState: OrganizationBillingState;
    let paymentFailureEvent: "paidActivationFailedFreeContinued" | "paidActivationFailedRestrictedContinued" | null =
      null;
    let scheduledChangeCanceled = false;
    switch (args.state.kind) {
      case "initialPaymentPending":
        nextState = { ...args.state, startedAt: now };
        break;
      case "pendingActivation":
        nextState = {
          ...args.state,
          ...(args.state.fallback === "restricted"
            ? {
                restrictedFallbackState:
                  billingState.state.kind === "restricted"
                    ? billingState.state
                    : billingState.state.kind === "pendingActivation"
                      ? billingState.state.restrictedFallbackState
                      : undefined,
              }
            : {}),
          startedAt: now,
        };
        break;
      case "grace":
        nextState = createPaymentGraceState(args.state.plan, args.state.firstFailureAt);
        break;
      case "paymentFailed": {
        const resolution = await resolvePendingActivationFailure(ctx, billingState, now);
        nextState = resolution.state;
        paymentFailureEvent = resolution.event;
        break;
      }
      case "scheduledChangeCanceled":
        if (billingState.state.kind !== "scheduledChange") {
          throw new ConvexError("現在の契約状態からこの変更は適用できません");
        }
        nextState = { kind: "active", plan: billingState.state.currentPlan };
        scheduledChangeCanceled = true;
        break;
      default:
        nextState = args.state;
    }
    if (
      !isVerifiedBillingTransitionAllowed(
        billingState.state,
        nextState,
        scheduledChangeCanceled ? "scheduledChangeCanceled" : "stateUpdate",
      )
    ) {
      throw new ConvexError("現在の契約状態からこの変更は適用できません");
    }
    if (nextState.kind === "scheduledChange" && nextState.targetPlan === "pro") {
      const usage = await getOrganizationUsageSnapshot(ctx, args.organizationId);
      const eligibility = evaluatePlanLimits("pro", {
        peopleCount: usage.projectedPersonCount,
        activeManagerCount: usage.projectedActiveManagerCount,
        activeShopCount: usage.activeShopCount,
      });
      if (!eligibility.withinLimits) {
        throw new ConvexError("現在の利用状況がProの上限を超えているため、プラン変更を予約できません");
      }
    }
    if (nextState.kind === "active" && nextState.plan !== "free" && !scheduledChangeCanceled) {
      await applyVerifiedPaidRestoration(ctx, {
        organizationId: args.organizationId,
        plan: nextState.plan,
        currentState: billingState.state,
        restoreManagerPersonIds: args.restoreManagerPersonIds,
        restoreShopIds: args.restoreShopIds,
        now,
      });
    }
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: billingState.state.kind,
      toState: nextState.kind === "active" ? nextState.plan : nextState.kind,
      correlationId: args.correlationId,
      occurredAt: now,
    });
    const updated = { ...billingState, state: nextState, version: nextVersion, updatedAt: now };
    await scheduleOrganizationBillingStateDeadline(ctx, updated);
    const event = paymentFailureEvent
      ? paymentFailureEvent
      : scheduledChangeCanceled
        ? ("scheduledChangeCanceled" as const)
        : nextState.kind === "active"
          ? billingState.state.kind === "restricted" ||
            billingState.state.kind === "pendingActivation" ||
            billingState.state.kind === "grace"
            ? ("recovered" as const)
            : ("planActivated" as const)
          : nextState.kind === "grace"
            ? ("graceStarted" as const)
            : nextState.kind === "scheduledChange"
              ? ("scheduledChange" as const)
              : nextState.kind === "initialPaymentPending"
                ? ("initialPaymentPending" as const)
                : null;
    if (event) {
      const restoredUserIds = args.restoreManagerPersonIds
        ? await userIdsForPeople(ctx, args.organizationId, args.restoreManagerPersonIds)
        : [];
      await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: args.organizationId,
        event,
        eventKey: args.correlationId,
        ...(event === "recovered"
          ? { recipientUserIds: [...new Set([...priorRecipientUserIds, ...restoredUserIds])] }
          : {}),
      });
    }
    if (nextState.kind === "grace" && nextState.endsAt - GRACE_ENDING_REMINDER_LEAD_MS > now) {
      await ctx.scheduler.runAt(
        nextState.endsAt - GRACE_ENDING_REMINDER_LEAD_MS,
        internal.organizationBilling.actions.enqueueBillingNotification,
        {
          organizationId: args.organizationId,
          event: "graceEndingSoon",
          eventKey: `${args.correlationId}:ending-soon`,
          expectedDeadlineAt: nextState.endsAt,
        },
      );
    }
    return { changed: true, stateKind: nextState.kind === "active" ? nextState.plan : nextState.kind };
  },
});

export const updateBillingEmail = authenticatedMutation({
  args: { shopId: v.id("shops"), email: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      allowReadOnly: true,
    });
    const billingState = await getOrganizationBillingState(ctx, actor.organization._id);
    if (!billingState) {
      throw new ConvexError("グループの契約情報を確認中です");
    }
    if (billingState.state.kind === "complimentary") {
      throw new ConvexError("料金なしのBusinessでは請求先メールアドレスを変更できません");
    }
    const normalized = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
      throw new ConvexError("メールアドレスの形式で入力してください");
    }
    const requiresRestrictedRecovery =
      billingState.state.kind === "restricted" ||
      (billingState.state.kind === "pendingActivation" && billingState.state.fallback === "restricted");
    if (requiresRestrictedRecovery) {
      await requireRestrictedRecoveryCapability(ctx, {
        organizationId: actor.organization._id,
        personId: actor.person._id,
        capability: "updateBillingEmail",
      });
    } else if (actor.member.status !== "active") {
      throw new ConvexError("この操作を行う権限がありません");
    }
    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId = `${actor.organization._id}:billing-email:${requestKey}`;
    const existing = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .first();
    if (existing) return { changed: false };

    await ctx.db.patch(actor.organization._id, {
      billingEmail: args.email.trim(),
      billingEmailNormalized: normalized,
      updatedAt: Date.now(),
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: actor.organization._id,
      actorUserId: actor.member.userId,
      actorPersonId: actor.person._id,
      action: "organization.billing_email_changed",
      targetKind: "organization",
      targetId: actor.organization._id,
      correlationId,
    });
    await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
      organizationId: actor.organization._id,
      event: "billingEmailChanged",
      eventKey: correlationId,
    });
    return { changed: true };
  },
});

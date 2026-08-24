import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { authenticatedMutation } from "../_lib/functions";
import { normalizeEmail } from "../_lib/validation";
import { type AnalyticsSourceEventPayload, analyticsPlanForBillingState } from "../analytics/sourceEvents";
import {
  type OrganizationReadActor,
  requireOrganizationActorForShop,
  requireOrganizationReadActor,
} from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import {
  getOrganizationBillingState,
  getOrganizationUsageSnapshot,
  toOrganizationActualUsage,
} from "../organization/service";
import { syncActivatedOrganizationStaffOrder } from "../organization/staffOrder";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { scheduleOrganizationBillingStateDeadline } from "./deadline";
import {
  type OrganizationBillingNotificationDetails,
  organizationBillingNotificationDetailsValidator,
} from "./notification";
import {
  createPaymentGraceState,
  decideScheduledTransition,
  evaluateOrganizationUsageLimits,
  evaluatePlanLimits,
  getEffectiveRestrictedBillingState,
  isVerifiedBillingTransitionAllowed,
  type OrganizationBillingState,
  type OrganizationPaidPlan,
  type OrganizationPersonUsageInput,
  projectOrganizationUsage,
} from "./policy";
import { requireRestrictedRecoveryCapability } from "./service";

const transitionResultValidator = v.object({
  changed: v.boolean(),
  stateKind: v.optional(v.string()),
});

const GRACE_ENDING_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;
const INITIAL_PAYMENT_RECONCILE_DELAY_MS = 15 * 60 * 1000;

type AnalyticsPlanPayload = Extract<AnalyticsSourceEventPayload, { kind: "plan" }>;
type AnalyticsBillingStatusDelta = AnalyticsPlanPayload["statusDeltas"][number];

function billingAnalyticsEvent(
  state: OrganizationBillingState,
  billingVersion: number,
  effectiveAt: number,
  statusDeltas: AnalyticsBillingStatusDelta[],
) {
  const plan = analyticsPlanForBillingState(state);
  if (!plan) return undefined;
  return {
    eventType: "plan.changed" as const,
    payload: {
      kind: "plan" as const,
      plan,
      billingVersion,
      effectiveAt,
      statusDeltas,
    },
  };
}

function resolveNotificationDetails(
  nextState: OrganizationBillingState,
  supplied?: OrganizationBillingNotificationDetails,
): OrganizationBillingNotificationDetails | undefined {
  const stateTargetPlan =
    nextState.kind === "active"
      ? nextState.plan
      : nextState.kind === "scheduledChange"
        ? nextState.targetPlan
        : undefined;
  const stateEffectiveAt = nextState.kind === "scheduledChange" ? nextState.effectiveAt : undefined;
  const stateRestrictAtPeriodEnd =
    nextState.kind === "scheduledChange" && nextState.targetPlan === "free" && nextState.restrictAtPeriodEnd === true;
  const stateRestrictionReason = nextState.kind === "restricted" ? nextState.reason : undefined;
  if (supplied?.targetPlan && stateTargetPlan && supplied.targetPlan !== stateTargetPlan) {
    throw new ConvexError("通知の変更先プランが、現在の契約状態と一致しません");
  }
  if (
    supplied?.effectiveAt !== undefined &&
    stateEffectiveAt !== undefined &&
    supplied.effectiveAt !== stateEffectiveAt
  ) {
    throw new ConvexError("通知の適用日時が契約状態と一致しません");
  }
  if ((supplied?.amountDue === undefined) !== (supplied?.currency === undefined)) {
    throw new ConvexError("通知の請求額と通貨を確認できません");
  }
  if (supplied?.restrictAtPeriodEnd === true && !stateRestrictAtPeriodEnd) {
    throw new ConvexError("通知の解約予定が、現在の契約状態と一致しません");
  }
  if (
    supplied?.restrictionReason !== undefined &&
    (stateRestrictionReason === undefined || supplied.restrictionReason !== stateRestrictionReason)
  ) {
    throw new ConvexError("通知の契約制限理由が、現在の契約状態と一致しません");
  }
  if (supplied?.amountDue !== undefined && (!Number.isSafeInteger(supplied.amountDue) || supplied.amountDue < 0)) {
    throw new ConvexError("通知の請求額を確認できません");
  }
  const normalizedCurrency = supplied?.currency?.trim().toLowerCase();
  if (normalizedCurrency !== undefined && !/^[a-z]{3}$/.test(normalizedCurrency)) {
    throw new ConvexError("通知の通貨を確認できません");
  }
  const effectiveAt = supplied?.effectiveAt ?? stateEffectiveAt;
  if (effectiveAt !== undefined && (!Number.isSafeInteger(effectiveAt) || effectiveAt < 0)) {
    throw new ConvexError("通知の適用日時を確認できません");
  }
  const details: OrganizationBillingNotificationDetails = {
    ...(supplied ?? {}),
    ...(stateTargetPlan ? { targetPlan: stateTargetPlan } : {}),
    ...(effectiveAt !== undefined ? { effectiveAt } : {}),
    ...(stateRestrictAtPeriodEnd ? { restrictAtPeriodEnd: true as const } : {}),
    ...(stateRestrictionReason ? { restrictionReason: stateRestrictionReason } : {}),
    ...(normalizedCurrency ? { currency: normalizedCurrency } : {}),
  };
  return Object.keys(details).length > 0 ? details : undefined;
}

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
  if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) return null;
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
  return state.kind === "restricted" || (state.kind === "pendingActivation" && state.fallback === "restricted");
}

async function applyVerifiedPaidRestoration(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    plan: OrganizationPaidPlan;
    currentState: OrganizationBillingState;
    restoreManagerPersonIds?: Id<"organizationPeople">[];
    restoreShopIds?: Id<"shops">[];
    now: number;
  },
) {
  const statusDeltas: AnalyticsBillingStatusDelta[] = [];
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
    return statusDeltas;
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
    if (member.status !== targetStatus) {
      await ctx.db.patch(member._id, { status: targetStatus, updatedAt: args.now });
      statusDeltas.push({
        kind: "manager",
        memberId: member._id,
        personId: member.personId,
        status: targetStatus,
      });
    }
  }
  for (const shop of shops) {
    if (shop.isDeleted || shop.operatingStatus === "archived") continue;
    const targetStatus = selectedShopIds.has(shop._id) ? "active" : "planSuspended";
    if (shop.operatingStatus !== targetStatus) {
      await ctx.db.patch(shop._id, { operatingStatus: targetStatus });
      statusDeltas.push({ kind: "shop", shopId: shop._id, status: targetStatus });
    }
  }
  if (statusDeltas.some((delta) => delta.kind === "shop")) {
    await syncActivatedOrganizationStaffOrder(ctx, { organizationId: args.organizationId });
  }
  return statusDeltas;
}

async function applyFreePlanAfterEntitlementEnd(
  ctx: MutationCtx,
  args: {
    billingState: Doc<"organizationBillingStates">;
    now: number;
    correlationId: string;
  },
) {
  const { billingState, now } = args;
  const existingAudit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .first();
  if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

  const [recipientUserIds, usage] = await Promise.all([
    getBillingRecipientUserIds(ctx, billingState.organizationId, billingState.state),
    getOrganizationUsageSnapshot(ctx, billingState.organizationId),
  ]);
  const usageLimitStatus = evaluateOrganizationUsageLimits({
    plan: "free",
    usage: toOrganizationActualUsage(usage),
  });
  const usageLimitExceeded = usageLimitStatus.kind === "overLimit";
  const nextState: OrganizationBillingState = { kind: "active", plan: "free" };
  const nextVersion = billingState.version + 1;
  await ctx.db.patch(billingState._id, {
    state: nextState,
    freeManagerPersonId: undefined,
    freeShopId: undefined,
    ...(usageLimitExceeded
      ? {
          businessNotificationCutoffAt: now,
          businessNotificationCutoffVersion: nextVersion,
        }
      : {}),
    version: nextVersion,
    updatedAt: now,
  });
  await revokePendingManagerInvitations(ctx, billingState.organizationId, now);
  if (usageLimitExceeded) {
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
      organizationId: billingState.organizationId,
      cutoffAt: now,
      cutoffVersion: nextVersion,
    });
  }
  const analyticsEvent = billingAnalyticsEvent(nextState, nextVersion, now, []);
  await recordOrganizationAuditEvent(ctx, {
    organizationId: billingState.organizationId,
    action: "organization.billing_state_changed",
    targetKind: "billing",
    targetId: billingState._id,
    fromState: billingState.state.kind,
    toState: "free",
    correlationId: args.correlationId,
    occurredAt: now,
    ...(analyticsEvent ? { analyticsEvent } : {}),
  });
  await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
    organizationId: billingState.organizationId,
    event: "freeApplied",
    eventKey: args.correlationId,
    recipientUserIds,
    notificationDetails: {
      targetPlan: "free",
      ...(usageLimitExceeded ? { usageLimitExceeded: true } : {}),
    },
  });
  return { changed: true, stateKind: "free", billingVersion: nextVersion, usageLimitExceeded };
}

async function isOrganizationOverPlanLimits(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  plan: "free" | OrganizationPaidPlan,
) {
  const usage = await getOrganizationUsageSnapshot(ctx, organizationId);
  return (
    evaluateOrganizationUsageLimits({
      plan,
      usage: toOrganizationActualUsage(usage),
    }).kind === "overLimit"
  );
}

async function resolveVerifiedPaidPlanApplication(args: {
  targetPlan: OrganizationPaidPlan;
}): Promise<OrganizationBillingState> {
  return { kind: "active", plan: args.targetPlan };
}

function resolvePendingActivationFailure(billingState: Doc<"organizationBillingStates">): {
  state: OrganizationBillingState;
  event:
    | "paidActivationFailedFreeContinued"
    | "paidActivationFailedProContinued"
    | "paidActivationFailedRestrictedContinued";
} {
  if (billingState.state.kind !== "pendingActivation") {
    throw new ConvexError("現在の契約状態では、この変更を適用できません");
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
  if (billingState.state.fallback === "pro") {
    return {
      state: { kind: "active", plan: "pro" },
      event: "paidActivationFailedProContinued",
    };
  }
  return {
    state: { kind: "active", plan: "free" },
    event: "paidActivationFailedFreeContinued",
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
    if (!billingState) throw new ConvexError("組織の契約情報を確認中です");
    if (billingState.state.kind === "complimentary") {
      throw new ConvexError("支払い不要の組織ではFree設定を変更できません");
    }
    if (billingState.state.kind === "initialPaymentPending") {
      throw new ConvexError("支払い結果を確認中のため、無料設定を変更できません");
    }
    if (billingState.state.kind === "pendingActivation" && billingState.state.fallback === "free") {
      throw new ConvexError("支払い結果を確認中のため、無料設定を変更できません");
    }
    const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
    const isLegacyFreeRestriction =
      restrictedState?.reason === "trialFreeConditionsNotMet" || restrictedState?.reason === "freeConditionsNotMet";
    const isLegacyScheduledFree =
      billingState.state.kind === "scheduledChange" &&
      billingState.state.targetPlan === "free" &&
      billingState.state.restrictAtPeriodEnd !== true;
    const canSetFreeSelection = isLegacyScheduledFree || (restrictedState !== null && isLegacyFreeRestriction);
    if (!canSetFreeSelection) {
      throw new ConvexError("現在の契約状態では無料設定を変更できません");
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
        throw new ConvexError("無料で残す管理者を確認できません");
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
        throw new ConvexError("無料で残す店舗を確認できません");
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
    await scheduleOrganizationBillingStateDeadline(ctx, updatedBillingState);
    return { changed: true, stateKind: updatedBillingState.state.kind };
  },
});

/** Stores the paid-plan choice while the organization remains in its trial. */
export const selectTrialPro = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
    // TODO[narrow]: planを送らない旧checkout actionと予約済みcallerがdrainした後にrequired化する。
    plan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const [organization, billingState] = await Promise.all([
      ctx.db.get(args.organizationId),
      getOrganizationBillingState(ctx, args.organizationId),
    ]);
    if (!organization || organization.isDeleted) return { changed: false };
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (billingState.state.kind !== "trial") {
      throw new ConvexError("現在の契約状態ではトライアル継続プランを選択できません");
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    // TODO[narrow]: 旧caller drainとtrialSetupCheckout targetPlan欠損0確認後にPro fallbackを削除する。
    const selectedPaidPlan = args.plan ?? "pro";
    if (existingAudit || billingState.state.selectedPaidPlan === selectedPaidPlan) {
      return { changed: false, stateKind: "trial" };
    }

    const now = Date.now();
    const nextVersion = billingState.version + 1;
    const nextState = { ...billingState.state, selectedPaidPlan };
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
      fromState: "trial",
      toState: `trial.${selectedPaidPlan}`,
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: "trial" };
  },
});

/** Clears a verified trialing Pro subscription choice without ending the trial. */
export const clearTrialPro = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (billingState.state.kind !== "trial" || !billingState.state.selectedPaidPlan) {
      throw new ConvexError("現在の契約状態ではトライアル継続プランを取り消せません");
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: "trial" };

    const now = Date.now();
    const nextVersion = billingState.version + 1;
    const nextState = { kind: "trial" as const, trialEndsAt: billingState.state.trialEndsAt };
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
      fromState: `trial.${billingState.state.selectedPaidPlan}`,
      toState: "trial",
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: "trial" };
  },
});

/** Trial終了と取消が競合した初回請求待ちを、現在のFree条件へ安全に収束させる。 */
export const resolveInitialPaymentCancellation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (billingState.state.kind !== "initialPaymentPending") {
      return { changed: false, stateKind: billingState.state.kind };
    }
    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, stateKind: result.stateKind };
  },
});

/** Re-evaluates restricted organizations when the Free people limit changes. */
export const reconcileRestrictedFreeEligibility = internalMutation({
  args: {
    billingStateId: v.id("organizationBillingStates"),
    expectedVersion: v.number(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await ctx.db.get(args.billingStateId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (
      billingState.state.kind !== "restricted" ||
      (billingState.state.reason !== "trialFreeConditionsNotMet" &&
        billingState.state.reason !== "freeConditionsNotMet")
    ) {
      return { changed: false, stateKind: billingState.state.kind };
    }

    // TODO[narrow]: Productionに旧restricted rowがないことを全deploymentで確認後、
    // 予約済みcallerのdrainと同時にこの互換入口を削除する。
    return { changed: false, stateKind: billingState.state.kind };
  },
});

/** 明示的な削減後に、制限対象プランの上限を再評価して自動復旧する。 */
export const reconcileRestrictedPlanEligibility = internalMutation({
  args: {
    billingStateId: v.id("organizationBillingStates"),
    expectedVersion: v.number(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await ctx.db.get(args.billingStateId);
    if (!billingState || billingState.version !== args.expectedVersion || billingState.state.kind !== "restricted") {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    // TODO[narrow]: Productionに旧restricted rowがないことを全deploymentで確認後、
    // 予約済みcallerのdrainと同時にこの互換入口を削除する。
    return { changed: false, stateKind: billingState.state.kind };
  },
});

/** Applies a provider-side cancellation that did not originate from a verified local plan change. */
export const applyUnexpectedCancellation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    const previousPaidPlan = previousPlan(billingState.state);
    const canRestrict =
      (billingState.state.kind === "active" && billingState.state.plan !== "free") ||
      billingState.state.kind === "grace" ||
      billingState.state.kind === "scheduledChange";
    if (!canRestrict || (previousPaidPlan !== "pro" && previousPaidPlan !== "business")) {
      throw new ConvexError("現在の契約状態では予期しない解約を適用できません");
    }
    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, stateKind: result.stateKind };
  },
});

async function transitionTrialToInitialPaymentPending(
  ctx: MutationCtx,
  args: {
    billingState: Doc<"organizationBillingStates">;
    trialEndsAt: number;
    now: number;
    correlationId: string;
    enqueueNotification: boolean;
  },
): Promise<Doc<"organizationBillingStates">> {
  const { billingState } = args;
  if (
    billingState.state.kind !== "trial" ||
    !billingState.state.selectedPaidPlan ||
    billingState.state.trialEndsAt !== args.trialEndsAt ||
    args.now < args.trialEndsAt
  ) {
    throw new ConvexError("現在は、トライアルの初回請求を開始できる状態ではありません");
  }

  const nextState = {
    kind: "initialPaymentPending" as const,
    plan: billingState.state.selectedPaidPlan,
    startedAt: args.now,
  };
  const nextVersion = billingState.version + 1;
  await ctx.db.patch(billingState._id, {
    state: nextState,
    version: nextVersion,
    updatedAt: args.now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: billingState.organizationId,
    action: "organization.billing_state_changed",
    targetKind: "billing",
    targetId: billingState._id,
    fromState: "trial",
    toState: "initialPaymentPending",
    correlationId: args.correlationId,
    occurredAt: args.now,
  });
  if (args.enqueueNotification) {
    await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
      organizationId: billingState.organizationId,
      event: "initialPaymentPending",
      eventKey: args.correlationId,
    });
  }
  await ctx.scheduler.runAfter(
    INITIAL_PAYMENT_RECONCILE_DELAY_MS,
    internal.organizationStripe.actions.reconcileInitialPaymentPending,
    {
      organizationId: billingState.organizationId,
      expectedBillingVersion: nextVersion,
      requestId: `initial-payment-reconcile-${nextVersion}`,
    },
  );
  return {
    ...billingState,
    state: nextState,
    version: nextVersion,
    updatedAt: args.now,
  };
}

/**
 * Atomically converges the trial deadline and the first invoice result.
 * A deadline job may have already performed only the initial-pending step.
 */
export const applyTrialInitialInvoiceResult = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    trialEndsAt: v.number(),
    result: v.union(v.literal("paid"), v.literal("failed")),
    firstFailureAt: v.optional(v.number()),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    let billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || Date.now() < args.trialEndsAt) return { changed: false };

    if (billingState.state.kind === "trial") {
      if (billingState.version !== args.expectedVersion) return { changed: false, stateKind: "trial" };
      billingState = await transitionTrialToInitialPaymentPending(ctx, {
        billingState,
        trialEndsAt: args.trialEndsAt,
        now: Date.now(),
        correlationId: `${args.correlationId}:initial-payment-pending`,
        enqueueNotification: false,
      });
    } else if (
      billingState.state.kind !== "initialPaymentPending" ||
      billingState.state.startedAt < args.trialEndsAt ||
      (billingState.version !== args.expectedVersion && billingState.version !== args.expectedVersion + 1)
    ) {
      return { changed: false, stateKind: billingState.state.kind };
    }

    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };
    if (args.result === "failed" && args.firstFailureAt === undefined) {
      throw new ConvexError("初回請求失敗時刻を確認できません");
    }
    if (billingState.state.kind !== "initialPaymentPending") {
      return { changed: false, stateKind: billingState.state.kind };
    }

    const now = Date.now();
    const targetPlan = billingState.state.plan;
    const nextState: OrganizationBillingState =
      args.result === "paid"
        ? { kind: "active", plan: targetPlan }
        : createPaymentGraceState("pro", args.firstFailureAt as number, targetPlan);
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
      fromState: "initialPaymentPending",
      toState: args.result === "paid" ? targetPlan : "grace",
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    const recipientUserIds = await getBillingRecipientUserIds(ctx, args.organizationId, nextState);
    await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
      organizationId: args.organizationId,
      event: args.result === "paid" ? "planActivated" : "graceStarted",
      eventKey: args.correlationId,
      recipientUserIds,
      ...(args.result === "paid" ? { notificationDetails: { targetPlan, effectiveAt: args.trialEndsAt } } : {}),
    });
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
    return { changed: true, stateKind: nextState.kind === "active" ? nextState.plan : "grace" };
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
        await transitionTrialToInitialPaymentPending(ctx, {
          billingState,
          trialEndsAt: billingState.state.trialEndsAt,
          now,
          correlationId,
          enqueueNotification: true,
        });
        return { changed: true, stateKind: "initialPaymentPending" };
      }
      const result = await applyFreePlanAfterEntitlementEnd(ctx, {
        billingState,
        now,
        correlationId,
      });
      return { changed: result.changed, stateKind: result.stateKind };
    }

    if (billingState.state.kind === "grace") {
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.stopExpiredGraceCollection, {
        organizationId: billingState.organizationId,
        expectedBillingVersion: billingState.version,
        requestId: `grace-stop-${billingState.version}`,
      });
      return { changed: false, stateKind: "grace" };
    }

    if (billingState.state.kind === "scheduledChange") {
      if (billingState.state.targetPlan === "free") {
        await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
          organizationId: billingState.organizationId,
          expectedBillingVersion: billingState.version,
          requestId: `scheduled-free-${billingState.version}`,
        });
        return { changed: false, stateKind: "scheduledChange" };
      }
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline, {
        organizationId: billingState.organizationId,
        expectedBillingVersion: billingState.version,
        requestId: `scheduled-paid-${billingState.version}`,
      });
      return { changed: false, stateKind: "scheduledChange" };
    }

    return { changed: false, stateKind: billingState.state.kind };
  },
});

/** Stripeで期間末解約を確認した場合だけ、互換Free移行または解約を確定する。 */
export const confirmScheduledFreeDeadline = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedDeadlineAt: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "scheduledChange" ||
      billingState.state.targetPlan !== "free" ||
      billingState.state.effectiveAt !== args.expectedDeadlineAt ||
      Date.now() < args.expectedDeadlineAt
    ) {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, stateKind: result.stateKind };
  },
});

/** Stripe Scheduleのphase移行と請求結果を再取得できた場合だけBusiness→Proを確定する。 */
export const confirmScheduledPaidPlanDeadline = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedDeadlineAt: v.number(),
    result: v.union(v.literal("paid"), v.literal("failed")),
    firstFailureAt: v.optional(v.number()),
    amountDue: v.optional(v.number()),
    currency: v.optional(v.string()),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "scheduledChange" ||
      billingState.state.currentPlan !== "business" ||
      billingState.state.targetPlan !== "pro" ||
      billingState.state.effectiveAt !== args.expectedDeadlineAt ||
      Date.now() < args.expectedDeadlineAt
    ) {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    if (args.result === "failed" && args.firstFailureAt === undefined) {
      throw new ConvexError("請求失敗時刻を確認できません");
    }
    if (
      args.result === "paid" &&
      (args.amountDue === undefined ||
        !Number.isSafeInteger(args.amountDue) ||
        args.amountDue < 0 ||
        !args.currency?.trim())
    ) {
      throw new ConvexError("確定した請求内容を確認できません");
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

    const now = Date.now();
    const nextState =
      args.result === "paid"
        ? await resolveVerifiedPaidPlanApplication({
            targetPlan: "pro",
          })
        : createPaymentGraceState("business", args.firstFailureAt as number, "pro");
    if (!isVerifiedBillingTransitionAllowed(billingState.state, nextState)) {
      throw new ConvexError("現在の契約状態では、この変更を適用できません");
    }
    const usageLimitExceeded =
      nextState.kind === "active"
        ? await isOrganizationOverPlanLimits(ctx, args.organizationId, nextState.plan)
        : false;
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      ...(nextState.kind === "active"
        ? {
            freeManagerPersonId: undefined,
            freeShopId: undefined,
          }
        : {}),
      ...(usageLimitExceeded
        ? {
            businessNotificationCutoffAt: now,
            businessNotificationCutoffVersion: nextVersion,
          }
        : {}),
      version: nextVersion,
      updatedAt: now,
    });
    if (usageLimitExceeded) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId: args.organizationId,
        cutoffAt: now,
        cutoffVersion: nextVersion,
      });
    }
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "scheduledChange",
      toState: nextState.kind === "active" ? nextState.plan : nextState.kind,
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    const recipients = await getBillingRecipientUserIds(ctx, args.organizationId, billingState.state);
    await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingNotification, {
      organizationId: args.organizationId,
      event:
        nextState.kind === "active"
          ? "planActivated"
          : nextState.kind === "grace"
            ? "graceStarted"
            : "restrictedStarted",
      eventKey: args.correlationId,
      recipientUserIds: recipients,
      ...(args.result === "paid"
        ? {
            notificationDetails: {
              targetPlan: "pro",
              amountDue: args.amountDue,
              currency: args.currency,
              effectiveAt: args.expectedDeadlineAt,
              ...(usageLimitExceeded ? { usageLimitExceeded: true } : {}),
            },
          }
        : {}),
    });
    return { changed: true, stateKind: nextState.kind === "active" ? nextState.plan : nextState.kind };
  },
});

export const expireVerifiedPaymentGrace = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedEndsAt: v.number(),
    cancelOperationId: v.id("organizationStripeOperations"),
    stopInvoiceCollectionOperationId: v.id("organizationStripeOperations"),
    correlationId: v.string(),
  },
  returns: v.object({ changed: v.boolean(), billingVersion: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "grace" ||
      billingState.state.endsAt !== args.expectedEndsAt ||
      Date.now() < args.expectedEndsAt
    ) {
      return { changed: false };
    }
    const [cancelOperation, stopInvoiceCollectionOperation] = await Promise.all([
      ctx.db.get(args.cancelOperationId),
      ctx.db.get(args.stopInvoiceCollectionOperationId),
    ]);
    const hasVerifiedCollectionStop =
      cancelOperation?.organizationId === args.organizationId &&
      cancelOperation.kind === "cancelSubscription" &&
      cancelOperation.status === "succeeded" &&
      cancelOperation.expectedBillingVersion === args.expectedVersion &&
      stopInvoiceCollectionOperation?.organizationId === args.organizationId &&
      stopInvoiceCollectionOperation.kind === "stopInvoiceCollection" &&
      stopInvoiceCollectionOperation.status === "succeeded" &&
      stopInvoiceCollectionOperation.expectedBillingVersion === args.expectedVersion &&
      stopInvoiceCollectionOperation.requestKey === cancelOperation.requestKey &&
      stopInvoiceCollectionOperation.livemode === cancelOperation.livemode &&
      stopInvoiceCollectionOperation.providerGeneration === cancelOperation.providerGeneration;
    if (!hasVerifiedCollectionStop) {
      throw new ConvexError("支払い猶予終了後の回収停止を確認できません");
    }

    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, billingVersion: result.billingVersion };
  },
});

export const setStateFromVerifiedBilling = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    state: v.union(
      v.object({
        kind: v.literal("initialPaymentPending"),
        plan: v.union(v.literal("pro"), v.literal("business")),
      }),
      v.object({
        kind: v.literal("pendingActivation"),
        plan: v.union(v.literal("pro"), v.literal("business")),
        fallback: v.union(v.literal("free"), v.literal("pro"), v.literal("restricted")),
      }),
      v.object({
        kind: v.literal("active"),
        plan: v.union(v.literal("pro"), v.literal("business")),
      }),
      v.object({ kind: v.literal("paymentFailed") }),
      v.object({ kind: v.literal("scheduledChangeCanceled") }),
      v.object({
        kind: v.literal("grace"),
        plan: v.union(v.literal("pro"), v.literal("business")),
        targetPlan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
        firstFailureAt: v.number(),
      }),
      v.object({
        kind: v.literal("scheduledChange"),
        currentPlan: v.literal("pro"),
        targetPlan: v.literal("free"),
        effectiveAt: v.number(),
        restrictAtPeriodEnd: v.optional(v.literal(true)),
      }),
      v.object({
        kind: v.literal("scheduledChange"),
        currentPlan: v.literal("business"),
        targetPlan: v.literal("pro"),
        effectiveAt: v.number(),
      }),
      v.object({
        kind: v.literal("scheduledChange"),
        currentPlan: v.literal("business"),
        targetPlan: v.literal("free"),
        effectiveAt: v.number(),
        restrictAtPeriodEnd: v.optional(v.literal(true)),
      }),
    ),
    correlationId: v.string(),
    restoreManagerPersonIds: v.optional(v.array(v.id("organizationPeople"))),
    restoreShopIds: v.optional(v.array(v.id("shops"))),
    notificationDetails: v.optional(organizationBillingNotificationDetailsValidator),
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
    let paymentFailureEvent:
      | "paidActivationFailedFreeContinued"
      | "paidActivationFailedProContinued"
      | "paidActivationFailedRestrictedContinued"
      | null = null;
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
        nextState = createPaymentGraceState(
          args.state.plan,
          args.state.firstFailureAt,
          args.state.targetPlan ?? args.state.plan,
        );
        break;
      case "paymentFailed": {
        const resolution = resolvePendingActivationFailure(billingState);
        nextState = resolution.state;
        paymentFailureEvent = resolution.event;
        break;
      }
      case "scheduledChangeCanceled":
        if (billingState.state.kind !== "scheduledChange") {
          throw new ConvexError("現在の契約状態では、この変更を適用できません");
        }
        nextState = { kind: "active", plan: billingState.state.currentPlan };
        scheduledChangeCanceled = true;
        break;
      default:
        nextState = args.state;
    }
    if (
      nextState.kind === "active" &&
      nextState.plan === "pro" &&
      ((billingState.state.kind === "scheduledChange" && billingState.state.currentPlan === "business") ||
        (billingState.state.kind === "grace" &&
          billingState.state.plan === "business" &&
          billingState.state.targetPlan === "pro"))
    ) {
      nextState = await resolveVerifiedPaidPlanApplication({
        targetPlan: "pro",
      });
    }
    if (
      !isVerifiedBillingTransitionAllowed(
        billingState.state,
        nextState,
        scheduledChangeCanceled
          ? "scheduledChangeCanceled"
          : args.state.kind === "paymentFailed"
            ? "paymentFailed"
            : "stateUpdate",
      )
    ) {
      throw new ConvexError("現在の契約状態では、この変更を適用できません");
    }
    let notificationDetails: OrganizationBillingNotificationDetails | undefined =
      scheduledChangeCanceled &&
      billingState.state.kind === "scheduledChange" &&
      billingState.state.targetPlan === "free" &&
      billingState.state.restrictAtPeriodEnd === true
        ? { restrictAtPeriodEnd: true as const }
        : resolveNotificationDetails(nextState, args.notificationDetails);
    let analyticsStatusDeltas: AnalyticsBillingStatusDelta[] = [];
    if (nextState.kind === "active" && nextState.plan !== "free" && !scheduledChangeCanceled) {
      analyticsStatusDeltas = await applyVerifiedPaidRestoration(ctx, {
        organizationId: args.organizationId,
        plan: nextState.plan,
        currentState: billingState.state,
        restoreManagerPersonIds: args.restoreManagerPersonIds,
        restoreShopIds: args.restoreShopIds,
        now,
      });
    }
    const usageLimitExceeded =
      nextState.kind === "active"
        ? await isOrganizationOverPlanLimits(ctx, args.organizationId, nextState.plan)
        : false;
    if (usageLimitExceeded) {
      notificationDetails = { ...(notificationDetails ?? {}), usageLimitExceeded: true };
    }
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      ...(nextState.kind === "active"
        ? {
            freeManagerPersonId: undefined,
            freeShopId: undefined,
          }
        : {}),
      ...(usageLimitExceeded
        ? {
            businessNotificationCutoffAt: now,
            businessNotificationCutoffVersion: nextVersion,
          }
        : {}),
      version: nextVersion,
      updatedAt: now,
    });
    if (usageLimitExceeded) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId: args.organizationId,
        cutoffAt: now,
        cutoffVersion: nextVersion,
      });
    }
    const analyticsEvent = billingAnalyticsEvent(nextState, nextVersion, now, analyticsStatusDeltas);
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: billingState.state.kind,
      toState: nextState.kind === "active" ? nextState.plan : nextState.kind,
      correlationId: args.correlationId,
      occurredAt: now,
      ...(analyticsEvent ? { analyticsEvent } : {}),
    });
    const updated = { ...billingState, state: nextState, version: nextVersion, updatedAt: now };
    await scheduleOrganizationBillingStateDeadline(ctx, updated);
    const event = paymentFailureEvent
      ? paymentFailureEvent
      : scheduledChangeCanceled
        ? ("scheduledChangeCanceled" as const)
        : nextState.kind === "active"
          ? billingState.state.kind === "restricted" ||
            (billingState.state.kind === "pendingActivation" && billingState.state.fallback !== "pro") ||
            billingState.state.kind === "grace"
            ? ("recovered" as const)
            : ("planActivated" as const)
          : nextState.kind === "grace"
            ? ("graceStarted" as const)
            : nextState.kind === "scheduledChange"
              ? ("scheduledChange" as const)
              : nextState.kind === "restricted"
                ? ("restrictedStarted" as const)
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
        ...(notificationDetails ? { notificationDetails } : {}),
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

/** 検証済みのより早い初回失敗だけを採用し、14日猶予を配送順で延長させない。 */
export const tightenVerifiedPaymentGrace = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    firstFailureAt: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "grace" ||
      !Number.isSafeInteger(args.firstFailureAt) ||
      args.firstFailureAt < 0 ||
      args.firstFailureAt >= billingState.state.startedAt
    ) {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: "grace" };

    const now = Date.now();
    const nextState = createPaymentGraceState(
      billingState.state.plan,
      args.firstFailureAt,
      billingState.state.targetPlan ?? billingState.state.plan,
    );
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_grace_shortened",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "grace",
      toState: "grace",
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    if (nextState.endsAt - GRACE_ENDING_REMINDER_LEAD_MS > now) {
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
    return { changed: true, stateKind: "grace" };
  },
});

async function updateBillingEmailForActor(
  ctx: MutationCtx,
  args: { email: string; requestId: string },
  actor: OrganizationReadActor,
) {
  const billingState = await getOrganizationBillingState(ctx, actor.organization._id);
  if (!billingState) {
    throw new ConvexError("組織の契約情報を確認中です");
  }
  if (billingState.state.kind === "complimentary") {
    throw new ConvexError("支払い不要の組織では請求先メールアドレスを変更できません");
  }
  const normalized = normalizeEmail(args.email);
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
  if (actor.organization.billingEmailNormalized === normalized) return { changed: false };

  const correlationId = `${actor.organization._id}:billing-email:${requestKey}`;
  const existing = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .first();
  if (existing) return { changed: false };

  await ctx.db.patch(actor.organization._id, {
    billingEmail: args.email.trim(),
    billingEmailNormalized: normalized,
    billingEmailSyncKey: requestKey,
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
  await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.syncBillingEmail, {
    organizationId: actor.organization._id,
    requestId: requestKey,
  });
  return { changed: true };
}

export const updateBillingEmail = authenticatedMutation({
  args: { shopId: v.id("shops"), email: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
      allowReadOnly: true,
    });
    return await updateBillingEmailForActor(ctx, args, actor);
  },
});

export const updateBillingEmailForOrganization = authenticatedMutation({
  args: { organizationId: v.id("organizations"), email: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationReadActor(ctx, {
      user: ctx.user,
      organizationId: args.organizationId,
    });
    return await updateBillingEmailForActor(ctx, args, actor);
  },
});

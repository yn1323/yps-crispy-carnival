import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getDeadlineCutoff, getSubmitLinkCutoff } from "../_lib/dateFormat";
import { DAY_MS } from "../constants";
import { ANALYTICS_POLICY } from "./registry";
import type { AnalyticsSourceEventPayload } from "./sourceEvents";

type OrganizationPayload = Extract<AnalyticsSourceEventPayload, { kind: "organization" }>;
type ShopPayload = Extract<AnalyticsSourceEventPayload, { kind: "shop" }>;
type PersonPayload = Extract<AnalyticsSourceEventPayload, { kind: "person" }>;
type ManagerMembershipPayload = Extract<AnalyticsSourceEventPayload, { kind: "managerMembership" }>;
type StaffMembershipPayload = Extract<AnalyticsSourceEventPayload, { kind: "staffMembership" }>;
type CyclePayload = Extract<AnalyticsSourceEventPayload, { kind: "cycle" }>;
type LineAccountPayload = Extract<AnalyticsSourceEventPayload, { kind: "lineAccount" }>;

const SOURCE_BATCH_LIMIT = ANALYTICS_POLICY.batch.sourceEvents;
const PROJECTION_PAGE_SIZE = ANALYTICS_POLICY.batch.cleanup;
const SCOPE_READ_LIMIT = ANALYTICS_POLICY.batch.scopeReadLimit;
const OPPORTUNITY_RETENTION_MS = ANALYTICS_POLICY.retention.opportunityDays * DAY_MS;

function assertScopeLimit<T>(rows: T[]): asserts rows is T[] {
  if (rows.length > SCOPE_READ_LIMIT) throw new Error("analytics_scope_limit_exceeded");
}

function assertSourceBatchLimit(items: readonly unknown[], errorCode: string) {
  if (items.length > SOURCE_BATCH_LIMIT) throw new Error(errorCode);
}

function activeAt(row: { validFrom: number; validTo?: number }, cutoffAt: number) {
  return row.validFrom < cutoffAt && (row.validTo === undefined || cutoffAt <= row.validTo);
}

function minDefined(current: number | undefined, candidate: number) {
  return current === undefined ? candidate : Math.min(current, candidate);
}

async function getOrganization(ctx: MutationCtx, organizationId: Id<"organizations">) {
  return await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
}

async function getShop(ctx: MutationCtx, shopId: Id<"shops">) {
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .unique();
}

async function getPerson(ctx: MutationCtx, personId: Id<"organizationPeople">) {
  return await ctx.db
    .query("analyticsPeople")
    .withIndex("by_organizationPersonId", (q) => q.eq("organizationPersonId", personId))
    .unique();
}

async function getLatestMembership(ctx: MutationCtx, membershipKey: string) {
  return await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_membershipKey_and_validFrom", (q) => q.eq("membershipKey", membershipKey))
    .order("desc")
    .first();
}

async function getExactMembership(ctx: MutationCtx, membershipKey: string, validFrom: number) {
  return await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_membershipKey_and_validFrom", (q) => q.eq("membershipKey", membershipKey).eq("validFrom", validFrom))
    .unique();
}

async function updateOrganizationShopMilestones(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const organization = await getOrganization(ctx, organizationId);
  if (!organization) return;
  const shops = await ctx.db
    .query("analyticsShops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(shops);
  // 登録milestoneは後日の論理削除で巻き戻さない。
  const ordered = shops.sort(
    (left, right) => left.registeredAt - right.registeredAt || String(left.shopId).localeCompare(String(right.shopId)),
  );
  const first = ordered[0];
  const second = ordered[1];
  await ctx.db.patch(organization._id, {
    firstShopId: first?.shopId,
    firstShopAt: first?.registeredAt,
    secondShopId: second?.shopId,
    secondShopAt: second?.registeredAt,
    secondShopFirstConfirmedAt: second?.firstConfirmedAt,
  });
}

async function applyOrganizationEvent(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  occurredAt: number,
  payload: OrganizationPayload,
  dataStartAt: number,
) {
  const existing = await getOrganization(ctx, organizationId);
  if (existing && existing.updatedAt > occurredAt) return;
  const plan = payload.currentPlan ?? existing?.currentPlan;
  const value = {
    organizationId,
    displayName: payload.change === "deleted" ? "" : (payload.displayName ?? existing?.displayName ?? ""),
    registeredAt: payload.registeredAt ?? existing?.registeredAt ?? occurredAt,
    ...(payload.change === "deleted"
      ? { deletedAt: occurredAt }
      : payload.change === "created"
        ? {}
        : existing?.deletedAt !== undefined
          ? { deletedAt: existing.deletedAt }
          : {}),
    ...(plan ? { currentPlan: plan } : {}),
    ...((payload.currentPlan ? occurredAt : existing?.planEffectiveAt) !== undefined
      ? { planEffectiveAt: payload.currentPlan ? occurredAt : existing?.planEffectiveAt }
      : {}),
    ...(existing?.firstShopId ? { firstShopId: existing.firstShopId } : {}),
    ...(existing?.secondShopId ? { secondShopId: existing.secondShopId } : {}),
    ...(existing?.firstShopAt !== undefined ? { firstShopAt: existing.firstShopAt } : {}),
    ...(existing?.secondShopAt !== undefined ? { secondShopAt: existing.secondShopAt } : {}),
    ...(existing?.secondShopFirstConfirmedAt !== undefined
      ? { secondShopFirstConfirmedAt: existing.secondShopFirstConfirmedAt }
      : {}),
    updatedAt: occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsOrganizations", value);

  if (payload.initialShop) {
    await applyShopEvent(
      ctx,
      organizationId,
      payload.initialShop.shopId,
      occurredAt,
      {
        kind: "shop",
        change: "created",
        displayName: payload.initialShop.displayName,
        registeredAt: payload.initialShop.registeredAt,
        ...(payload.initialStaff
          ? {
              initialStaff: {
                staffId: payload.initialStaff.staffId,
                organizationPersonId: payload.initialStaff.organizationPersonId,
                validFrom: payload.initialStaff.validFrom,
                isShiftTarget: payload.initialStaff.isShiftTarget,
              },
            }
          : {}),
      },
      dataStartAt,
    );
  }
  if (payload.initialPersonId) {
    await applyPersonEvent(ctx, organizationId, payload.initialPersonId, occurredAt, {
      kind: "person",
      status: "active",
      firstObservedAt: value.registeredAt,
    });
    await applyManagerMembership(
      ctx,
      organizationId,
      {
        kind: "managerMembership",
        personId: payload.initialPersonId,
        status: "active",
        validFrom: Math.max(value.registeredAt, dataStartAt),
      },
      dataStartAt,
    );
  }
}

async function applyShopEvent(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  shopId: Id<"shops">,
  occurredAt: number,
  payload: ShopPayload,
  dataStartAt: number,
) {
  const [existing, organization] = await Promise.all([getShop(ctx, shopId), getOrganization(ctx, organizationId)]);
  if (!organization) throw new Error("analytics_projection_shop_organization_missing");
  if (existing && existing.organizationId !== organizationId) {
    throw new Error("analytics_projection_shop_organization_mismatch");
  }
  if (existing && existing.updatedAt > occurredAt) return;
  const inactive = payload.change === "deleted" || payload.change === "archived";
  const statusChanged = payload.change === "created" || payload.change === "reactivated" || inactive;
  const value = {
    organizationId,
    shopId,
    displayName: payload.change === "deleted" ? "" : (payload.displayName ?? existing?.displayName ?? ""),
    registeredAt: payload.registeredAt ?? existing?.registeredAt ?? occurredAt,
    ...(inactive
      ? { deletedAt: occurredAt }
      : payload.change === "reactivated" || payload.change === "created"
        ? {}
        : existing?.deletedAt !== undefined
          ? { deletedAt: existing.deletedAt }
          : {}),
    ...(organization.currentPlan ? { currentPlan: organization.currentPlan } : {}),
    ...(organization.planEffectiveAt !== undefined ? { planEffectiveAt: organization.planEffectiveAt } : {}),
    ...((statusChanged ? occurredAt : existing?.statusEffectiveAt) !== undefined
      ? { statusEffectiveAt: statusChanged ? occurredAt : existing?.statusEffectiveAt }
      : {}),
    ...(existing?.firstRecruitmentAt !== undefined ? { firstRecruitmentAt: existing.firstRecruitmentAt } : {}),
    ...(existing?.firstSubmissionAt !== undefined ? { firstSubmissionAt: existing.firstSubmissionAt } : {}),
    ...(existing?.firstConfirmedRecruitmentId
      ? { firstConfirmedRecruitmentId: existing.firstConfirmedRecruitmentId }
      : {}),
    ...(existing?.secondConfirmedRecruitmentId
      ? { secondConfirmedRecruitmentId: existing.secondConfirmedRecruitmentId }
      : {}),
    ...(existing?.firstConfirmedAt !== undefined ? { firstConfirmedAt: existing.firstConfirmedAt } : {}),
    ...(existing?.secondConfirmedAt !== undefined ? { secondConfirmedAt: existing.secondConfirmedAt } : {}),
    ...(existing?.latestActivityAt !== undefined
      ? { latestActivityAt: Math.max(existing.latestActivityAt, occurredAt) }
      : { latestActivityAt: occurredAt }),
    ...(existing?.estimatedCadenceDays !== undefined ? { estimatedCadenceDays: existing.estimatedCadenceDays } : {}),
    cadenceConfidence: existing?.cadenceConfidence ?? ("insufficientData" as const),
    updatedAt: occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsShops", value);
  await updateOrganizationShopMilestones(ctx, organizationId);

  if (payload.initialStaff) {
    await applyStaffMembership(
      ctx,
      organizationId,
      shopId,
      {
        kind: "staffMembership",
        staffId: payload.initialStaff.staffId,
        ...(payload.initialStaff.organizationPersonId
          ? { organizationPersonId: payload.initialStaff.organizationPersonId }
          : {}),
        status: "active",
        isShiftTarget: payload.initialStaff.isShiftTarget,
        validFrom: payload.initialStaff.validFrom,
        lineLinked: false,
        lineFollowing: false,
      },
      dataStartAt,
    );
  }
}

async function applyPersonEvent(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
  occurredAt: number,
  payload: PersonPayload,
) {
  const existing = await getPerson(ctx, personId);
  if (existing && existing.organizationId !== organizationId) {
    throw new Error("analytics_projection_person_organization_mismatch");
  }
  if (existing && existing.updatedAt > occurredAt) return;
  const value = {
    organizationId,
    organizationPersonId: personId,
    firstObservedAt: Math.min(existing?.firstObservedAt ?? payload.firstObservedAt, payload.firstObservedAt),
    ...(payload.status === "removed" ? { deletedAt: occurredAt } : {}),
    updatedAt: occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsPeople", value);
}

async function applyManagerMembership(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  payload: ManagerMembershipPayload,
  dataStartAt: number,
) {
  const validFrom = Math.max(payload.validFrom, dataStartAt);
  if (payload.personFirstObservedAt !== undefined) {
    await applyPersonEvent(ctx, organizationId, payload.personId, validFrom, {
      kind: "person",
      status: "active",
      firstObservedAt: payload.personFirstObservedAt,
    });
  } else if (!(await getPerson(ctx, payload.personId)) && payload.status === "active") {
    await applyPersonEvent(ctx, organizationId, payload.personId, validFrom, {
      kind: "person",
      status: "active",
      firstObservedAt: validFrom,
    });
  }
  const membershipKey = `manager:${organizationId}:${payload.personId}`;
  const latest = await getLatestMembership(ctx, membershipKey);
  const changeAt = Math.max(
    payload.status === "removed" ? (payload.validTo ?? payload.validFrom) : payload.validFrom,
    dataStartAt,
  );
  if (latest && latest.updatedAt > changeAt) return;
  if (payload.status === "removed") {
    if (latest?.role === "manager" && latest.validTo === undefined) {
      await ctx.db.patch(latest._id, { validTo: changeAt, updatedAt: changeAt });
    }
    return;
  }
  if (latest?.role === "manager" && latest.validTo === undefined) {
    await ctx.db.patch(latest._id, { updatedAt: Math.max(latest.updatedAt, changeAt) });
    return;
  }
  const exact = await getExactMembership(ctx, membershipKey, validFrom);
  const value = {
    membershipKey,
    organizationId,
    organizationPersonId: payload.personId,
    role: "manager" as const,
    validFrom,
    isShiftTarget: false as const,
    lineLinked: false as const,
    lineFollowing: false as const,
    updatedAt: changeAt,
  };
  if (exact) await ctx.db.replace(exact._id, value);
  else await ctx.db.insert("analyticsMemberships", value);
}

async function applyStaffMembership(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  shopId: Id<"shops">,
  payload: StaffMembershipPayload,
  dataStartAt: number,
) {
  const shop = await getShop(ctx, shopId);
  if (!shop || shop.organizationId !== organizationId) {
    throw new Error("analytics_projection_staff_shop_scope_invalid");
  }
  const validFrom = Math.max(payload.validFrom, dataStartAt);
  const membershipKey = `staff:${payload.staffId}`;
  const latest = await getLatestMembership(ctx, membershipKey);
  const changeAt = Math.max(
    payload.status === "removed" ? (payload.validTo ?? payload.validFrom) : payload.validFrom,
    dataStartAt,
  );
  if (latest && latest.updatedAt > changeAt) return;
  if (payload.status === "removed") {
    if (latest?.role === "staff" && latest.validTo === undefined) {
      await ctx.db.patch(latest._id, { validTo: changeAt, updatedAt: changeAt });
    }
    return;
  }
  if (payload.organizationPersonId) {
    await applyPersonEvent(ctx, organizationId, payload.organizationPersonId, validFrom, {
      kind: "person",
      status: "active",
      firstObservedAt: payload.personFirstObservedAt ?? validFrom,
    });
  }
  const lineLinked = payload.lineLinked ?? (latest?.role === "staff" ? latest.lineLinked : false);
  const lineFollowing = payload.lineFollowing ?? (latest?.role === "staff" ? latest.lineFollowing : false);
  if (
    latest?.role === "staff" &&
    latest.validTo === undefined &&
    latest.organizationId === organizationId &&
    latest.shopId === shopId &&
    latest.organizationPersonId === payload.organizationPersonId &&
    latest.isShiftTarget === payload.isShiftTarget &&
    latest.lineLinked === lineLinked &&
    latest.lineFollowing === lineFollowing
  ) {
    await ctx.db.patch(latest._id, { updatedAt: Math.max(latest.updatedAt, changeAt) });
    return;
  }
  if (latest && latest.validTo === undefined) {
    await ctx.db.patch(latest._id, { validTo: validFrom, updatedAt: validFrom });
  }
  const exact = await getExactMembership(ctx, membershipKey, validFrom);
  const value = {
    membershipKey,
    organizationId,
    shopId,
    ...(payload.organizationPersonId ? { organizationPersonId: payload.organizationPersonId } : {}),
    staffId: payload.staffId,
    role: "staff" as const,
    validFrom,
    isShiftTarget: payload.isShiftTarget,
    lineLinked,
    lineFollowing,
    updatedAt: changeAt,
  };
  if (exact) await ctx.db.replace(exact._id, value);
  else await ctx.db.insert("analyticsMemberships", value);
}

async function applyPlanEvent(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  occurredAt: number,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "plan" }>,
) {
  const organization = await getOrganization(ctx, organizationId);
  if (!organization) throw new Error("analytics_projection_plan_organization_missing");
  if (payload.plan && (organization.planEffectiveAt ?? Number.NEGATIVE_INFINITY) <= payload.effectiveAt) {
    await ctx.db.patch(organization._id, {
      currentPlan: payload.plan,
      planEffectiveAt: payload.effectiveAt,
      updatedAt: Math.max(organization.updatedAt, occurredAt),
    });
  }
}

async function updateShopCycleMilestones(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  recruitmentId: Id<"recruitments">,
  payload: CyclePayload,
  occurredAt: number,
) {
  const shop = await getShop(ctx, shopId);
  if (!shop) throw new Error("analytics_projection_cycle_shop_missing");
  const confirmations = [
    ...(shop.firstConfirmedRecruitmentId && shop.firstConfirmedAt !== undefined
      ? [{ recruitmentId: shop.firstConfirmedRecruitmentId, confirmedAt: shop.firstConfirmedAt }]
      : []),
    ...(shop.secondConfirmedRecruitmentId && shop.secondConfirmedAt !== undefined
      ? [{ recruitmentId: shop.secondConfirmedRecruitmentId, confirmedAt: shop.secondConfirmedAt }]
      : []),
    ...(payload.confirmedAt !== undefined ? [{ recruitmentId, confirmedAt: payload.confirmedAt }] : []),
  ];
  const byRecruitment = new Map<Id<"recruitments">, { recruitmentId: Id<"recruitments">; confirmedAt: number }>();
  for (const confirmation of confirmations) {
    const current = byRecruitment.get(confirmation.recruitmentId);
    if (!current || confirmation.confirmedAt < current.confirmedAt) {
      byRecruitment.set(confirmation.recruitmentId, confirmation);
    }
  }
  const ordered = [...byRecruitment.values()].sort(
    (left, right) =>
      left.confirmedAt - right.confirmedAt || String(left.recruitmentId).localeCompare(String(right.recruitmentId)),
  );
  const first = ordered[0];
  const second = ordered[1];
  await ctx.db.patch(shop._id, {
    firstRecruitmentAt: minDefined(shop.firstRecruitmentAt, payload.createdAt),
    firstConfirmedRecruitmentId: first?.recruitmentId,
    firstConfirmedAt: first?.confirmedAt,
    secondConfirmedRecruitmentId: second?.recruitmentId,
    secondConfirmedAt: second?.confirmedAt,
    latestActivityAt: Math.max(shop.latestActivityAt ?? 0, occurredAt),
    updatedAt: Math.max(shop.updatedAt, occurredAt),
  });
  await updateOrganizationShopMilestones(ctx, shop.organizationId);
}

async function applyCycleEvent(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  payload: CyclePayload,
  dataStartAt: number,
) {
  if (!event.organizationId || !event.shopId || !event.recruitmentId) {
    throw new Error("analytics_event_cycle_scope_missing");
  }
  const [organization, shop, existing] = await Promise.all([
    getOrganization(ctx, event.organizationId),
    getShop(ctx, event.shopId),
    ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", event.recruitmentId as Id<"recruitments">))
      .unique(),
  ]);
  if (!organization || !shop || shop.organizationId !== event.organizationId) {
    throw new Error("analytics_projection_cycle_scope_invalid");
  }
  if (existing && existing.updatedAt > event.occurredAt) return;
  const confirmedAt = payload.confirmedAt ?? existing?.confirmedAt;
  const submitDeadlineAt = getDeadlineCutoff(payload.deadline);
  const closeAt = confirmedAt ?? getSubmitLinkCutoff(payload.periodStart);
  const previousCloseAt = existing ? (existing.confirmedAt ?? getSubmitLinkCutoff(existing.periodStart)) : undefined;
  const resetDeadline = existing !== null && existing.submitDeadlineAt !== submitDeadlineAt;
  const resetClose = existing !== null && previousCloseAt !== closeAt;
  const predatesData = payload.createdAt < dataStartAt;
  const deadlineFinalized = !resetDeadline && existing?.targetAtDeadline !== undefined;
  const closeFinalized = !resetClose && existing?.targetAtClose !== undefined;
  const needsFinalizationAt = [
    ...(deadlineFinalized ? [] : [submitDeadlineAt]),
    ...(closeFinalized ? [] : [closeAt]),
  ].sort((left, right) => left - right)[0];
  const value = {
    recruitmentId: event.recruitmentId,
    organizationId: event.organizationId,
    shopId: event.shopId,
    ...(existing?.sequenceNumber !== undefined ? { sequenceNumber: existing.sequenceNumber } : {}),
    createdAt: payload.createdAt,
    submitDeadlineAt,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    ...(confirmedAt !== undefined ? { confirmedAt, closedAt: confirmedAt } : {}),
    ...(payload.status === "deleted" ? { deletedAt: event.occurredAt } : {}),
    ...(!resetDeadline && existing?.targetAtDeadline !== undefined
      ? { targetAtDeadline: existing.targetAtDeadline, submittedAtDeadline: existing.submittedAtDeadline }
      : {}),
    ...(!resetClose && existing?.targetAtClose !== undefined
      ? { targetAtClose: existing.targetAtClose, submittedAtClose: existing.submittedAtClose }
      : {}),
    notificationSentCount: resetClose ? 0 : (existing?.notificationSentCount ?? 0),
    notificationFailedCount: resetClose ? 0 : (existing?.notificationFailedCount ?? 0),
    ...(!resetClose && existing?.lastNotificationFailedAt !== undefined
      ? { lastNotificationFailedAt: existing.lastNotificationFailedAt }
      : {}),
    reminderSentCount: resetClose ? 0 : (existing?.reminderSentCount ?? 0),
    ...(!predatesData && payload.status !== "deleted" && needsFinalizationAt !== undefined
      ? { needsFinalizationAt }
      : {}),
    creationLeadTimeMs: getSubmitLinkCutoff(payload.periodStart) - payload.createdAt,
    ...(confirmedAt !== undefined
      ? {
          confirmationLeadTimeMs: confirmedAt - payload.createdAt,
          confirmationSlackMs: getSubmitLinkCutoff(payload.periodStart) - confirmedAt,
          confirmedBeforeStart: confirmedAt <= getSubmitLinkCutoff(payload.periodStart),
        }
      : {}),
    completeness:
      predatesData || resetDeadline || resetClose
        ? ("unavailable" as const)
        : (existing?.completeness ?? "unavailable"),
    ...(!predatesData && !resetDeadline && !resetClose && existing?.finalizedAt !== undefined
      ? { finalizedAt: existing.finalizedAt }
      : {}),
    updatedAt: event.occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsShiftCycles", value);
  if (payload.createdAt >= dataStartAt) {
    await updateShopCycleMilestones(ctx, event.shopId, event.recruitmentId, payload, event.occurredAt);
  }
}

async function applyFirstSubmissionEvent(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  firstSubmittedAt: number,
  dataStartAt: number,
) {
  if (firstSubmittedAt < dataStartAt) return;
  const shop = await getShop(ctx, shopId);
  if (!shop) throw new Error("analytics_projection_submission_shop_missing");
  await ctx.db.patch(shop._id, {
    firstSubmissionAt: minDefined(shop.firstSubmissionAt, firstSubmittedAt),
    latestActivityAt: Math.max(shop.latestActivityAt ?? 0, firstSubmittedAt),
    updatedAt: Math.max(shop.updatedAt, firstSubmittedAt),
  });
}

async function applyLineAccountEvent(
  ctx: MutationCtx,
  payload: LineAccountPayload,
  occurredAt: number,
  dataStartAt: number,
) {
  const latest = await getLatestMembership(ctx, `staff:${payload.staffId}`);
  if (latest?.role !== "staff" || latest.validTo !== undefined || latest.updatedAt > occurredAt) return;
  await applyStaffMembership(
    ctx,
    latest.organizationId,
    latest.shopId,
    {
      kind: "staffMembership",
      staffId: latest.staffId,
      ...(latest.organizationPersonId ? { organizationPersonId: latest.organizationPersonId } : {}),
      status: "active",
      isShiftTarget: latest.isShiftTarget,
      validFrom: occurredAt,
      lineLinked: payload.linked,
      lineFollowing: payload.following,
    },
    dataStartAt,
  );
}

const ANALYTICS_SOURCE_PROJECTION_SUBSTAGES = [
  "organizationDeletionShops",
  "organizationDeletionManagers",
  "personRemovalMemberships",
  "planShops",
  "planStatusDeltas",
] as const;

export type AnalyticsSourceProjectionSubstage = (typeof ANALYTICS_SOURCE_PROJECTION_SUBSTAGES)[number];

export function parseAnalyticsSourceProjectionSubstage(value: string | undefined): AnalyticsSourceProjectionSubstage {
  if (!ANALYTICS_SOURCE_PROJECTION_SUBSTAGES.some((candidate) => candidate === value)) {
    throw new Error("analytics_projection_continuation_invalid");
  }
  return value as AnalyticsSourceProjectionSubstage;
}

export type AnalyticsSourceProjectionPageResult =
  | { done: true }
  | { done: false; substage: AnalyticsSourceProjectionSubstage; cursor?: string };

const projectionComplete = { done: true } as const;

function projectionContinuation(
  substage: AnalyticsSourceProjectionSubstage,
  cursor?: string,
): AnalyticsSourceProjectionPageResult {
  return { done: false, substage, ...(cursor !== undefined ? { cursor } : {}) };
}

async function applyOrganizationDeletionShopsPage(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  cursor?: string,
): Promise<AnalyticsSourceProjectionPageResult> {
  if (!event.organizationId || event.payload.kind !== "organization" || event.payload.change !== "deleted") {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const organizationId = event.organizationId;
  const page = await ctx.db
    .query("analyticsShops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .paginate({ numItems: PROJECTION_PAGE_SIZE, cursor: cursor ?? null, maximumRowsRead: PROJECTION_PAGE_SIZE });
  for (const shop of page.page) {
    if ((shop.statusEffectiveAt ?? shop.updatedAt) > event.occurredAt) continue;
    await ctx.db.patch(shop._id, {
      displayName: "",
      deletedAt: event.occurredAt,
      statusEffectiveAt: event.occurredAt,
      updatedAt: Math.max(shop.updatedAt, event.occurredAt),
    });
  }
  return page.isDone
    ? projectionContinuation("organizationDeletionManagers")
    : projectionContinuation("organizationDeletionShops", page.continueCursor);
}

async function applyOrganizationDeletionManagersPage(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  cursor?: string,
): Promise<AnalyticsSourceProjectionPageResult> {
  if (!event.organizationId || event.payload.kind !== "organization" || event.payload.change !== "deleted") {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const organizationId = event.organizationId;
  const page = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_organizationId_and_role_and_validFrom", (q) =>
      q.eq("organizationId", organizationId).eq("role", "manager").lte("validFrom", event.occurredAt),
    )
    .paginate({ numItems: PROJECTION_PAGE_SIZE, cursor: cursor ?? null, maximumRowsRead: PROJECTION_PAGE_SIZE });
  for (const manager of page.page) {
    if (manager.validTo !== undefined) continue;
    await ctx.db.patch(manager._id, { validTo: event.occurredAt, updatedAt: event.occurredAt });
  }
  return page.isDone ? projectionComplete : projectionContinuation("organizationDeletionManagers", page.continueCursor);
}

async function applyPersonRemovalMembershipsPage(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  cursor?: string,
): Promise<AnalyticsSourceProjectionPageResult> {
  if (
    !event.organizationId ||
    !event.subjectId ||
    event.payload.kind !== "person" ||
    event.payload.status !== "removed"
  ) {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const personId = event.subjectId as Id<"organizationPeople">;
  const page = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_organizationPersonId_and_validFrom", (q) =>
      q.eq("organizationPersonId", personId).lte("validFrom", event.occurredAt),
    )
    .paginate({ numItems: PROJECTION_PAGE_SIZE, cursor: cursor ?? null, maximumRowsRead: PROJECTION_PAGE_SIZE });
  for (const membership of page.page) {
    if (membership.organizationId !== event.organizationId || membership.validTo !== undefined) continue;
    await ctx.db.patch(membership._id, { validTo: event.occurredAt, updatedAt: event.occurredAt });
  }
  return page.isDone ? projectionComplete : projectionContinuation("personRemovalMemberships", page.continueCursor);
}

async function applyPlanShopsPage(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  cursor?: string,
): Promise<AnalyticsSourceProjectionPageResult> {
  if (!event.organizationId || event.payload.kind !== "plan" || !event.payload.plan) {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const organizationId = event.organizationId;
  const page = await ctx.db
    .query("analyticsShops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .paginate({ numItems: PROJECTION_PAGE_SIZE, cursor: cursor ?? null, maximumRowsRead: PROJECTION_PAGE_SIZE });
  for (const shop of page.page) {
    if ((shop.planEffectiveAt ?? Number.NEGATIVE_INFINITY) > event.payload.effectiveAt) continue;
    await ctx.db.patch(shop._id, {
      currentPlan: event.payload.plan,
      planEffectiveAt: event.payload.effectiveAt,
      updatedAt: Math.max(shop.updatedAt, event.occurredAt),
    });
  }
  return page.isDone
    ? projectionContinuation("planStatusDeltas")
    : projectionContinuation("planShops", page.continueCursor);
}

async function applyPlanStatusDeltas(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  dataStartAt: number,
  cursor?: string,
): Promise<AnalyticsSourceProjectionPageResult> {
  if (!event.organizationId || event.payload.kind !== "plan") {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > event.payload.statusDeltas.length) {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const deltas = event.payload.statusDeltas.slice(offset, offset + PROJECTION_PAGE_SIZE);
  for (const delta of deltas) {
    if (delta.kind === "shop") {
      const shop = await getShop(ctx, delta.shopId);
      if (!shop || shop.organizationId !== event.organizationId) {
        throw new Error("analytics_plan_shop_delta_scope_missing");
      }
      if ((shop.statusEffectiveAt ?? Number.NEGATIVE_INFINITY) > event.payload.effectiveAt) continue;
      await ctx.db.patch(shop._id, {
        deletedAt: delta.status === "active" ? undefined : event.payload.effectiveAt,
        statusEffectiveAt: event.payload.effectiveAt,
        updatedAt: Math.max(shop.updatedAt, event.occurredAt),
      });
      continue;
    }
    await applyManagerMembership(
      ctx,
      event.organizationId,
      {
        kind: "managerMembership",
        personId: delta.personId,
        status: delta.status === "active" ? "active" : "removed",
        validFrom: event.payload.effectiveAt,
        ...(delta.status === "active" ? {} : { validTo: event.payload.effectiveAt }),
      },
      dataStartAt,
    );
  }
  const nextOffset = offset + deltas.length;
  return nextOffset < event.payload.statusDeltas.length
    ? projectionContinuation("planStatusDeltas", String(nextOffset))
    : projectionComplete;
}

/**
 * PII-free source eventを現在factへ、1 transactionの固定page単位で絶対反映する。
 * fan-out eventは返されたsubstage/cursorを次のmutationへ渡し、完了まで直列に進める。
 */
export async function applySourceEventPage(
  ctx: MutationCtx,
  event: Doc<"analyticsSourceEvents">,
  dataStartAt: number,
  substage?: AnalyticsSourceProjectionSubstage,
  cursor?: string,
): Promise<AnalyticsSourceProjectionPageResult> {
  if (substage) {
    switch (substage) {
      case "organizationDeletionShops":
        return await applyOrganizationDeletionShopsPage(ctx, event, cursor);
      case "organizationDeletionManagers":
        return await applyOrganizationDeletionManagersPage(ctx, event, cursor);
      case "personRemovalMemberships":
        return await applyPersonRemovalMembershipsPage(ctx, event, cursor);
      case "planShops":
        return await applyPlanShopsPage(ctx, event, cursor);
      case "planStatusDeltas":
        return await applyPlanStatusDeltas(ctx, event, dataStartAt, cursor);
    }
  }

  const payload = event.payload;
  switch (payload.kind) {
    case "organization":
      if (!event.organizationId) throw new Error("analytics_event_organization_id_missing");
      await applyOrganizationEvent(ctx, event.organizationId, event.occurredAt, payload, dataStartAt);
      return payload.change === "deleted" ? projectionContinuation("organizationDeletionShops") : projectionComplete;
    case "shop":
      if (!event.organizationId || !event.shopId) throw new Error("analytics_event_shop_scope_missing");
      await applyShopEvent(ctx, event.organizationId, event.shopId, event.occurredAt, payload, dataStartAt);
      return projectionComplete;
    case "person":
      if (!event.organizationId || !event.subjectId) throw new Error("analytics_event_person_scope_missing");
      await applyPersonEvent(
        ctx,
        event.organizationId,
        event.subjectId as Id<"organizationPeople">,
        event.occurredAt,
        payload,
      );
      return payload.status === "removed" ? projectionContinuation("personRemovalMemberships") : projectionComplete;
    case "managerMembership":
      if (!event.organizationId) throw new Error("analytics_event_manager_scope_missing");
      await applyManagerMembership(ctx, event.organizationId, payload, dataStartAt);
      return projectionComplete;
    case "staffMembership":
      if (!event.organizationId || !event.shopId) throw new Error("analytics_event_staff_scope_missing");
      await applyStaffMembership(ctx, event.organizationId, event.shopId, payload, dataStartAt);
      return projectionComplete;
    case "staffMembershipBatch":
      if (!event.organizationId || !event.shopId) throw new Error("analytics_event_staff_scope_missing");
      assertSourceBatchLimit(payload.memberships, "analytics_staff_membership_batch_too_large");
      for (const membership of payload.memberships) {
        await applyStaffMembership(
          ctx,
          event.organizationId,
          event.shopId,
          {
            kind: "staffMembership",
            ...membership,
            status: "active",
          },
          dataStartAt,
        );
      }
      return projectionComplete;
    case "plan":
      if (!event.organizationId) throw new Error("analytics_event_plan_scope_missing");
      await applyPlanEvent(ctx, event.organizationId, event.occurredAt, payload);
      return payload.plan ? projectionContinuation("planShops") : projectionContinuation("planStatusDeltas");
    case "cycle":
      await applyCycleEvent(ctx, event, payload, dataStartAt);
      return projectionComplete;
    case "submissionFirst":
      if (!event.shopId) throw new Error("analytics_event_submission_scope_missing");
      await applyFirstSubmissionEvent(ctx, event.shopId, payload.firstSubmittedAt, dataStartAt);
      return projectionComplete;
    case "lineAccount":
      await applyLineAccountEvent(ctx, payload, event.occurredAt, dataStartAt);
      return projectionComplete;
    case "lineAccountBatch":
      if (!payload.isComplete) throw new Error("analytics_line_batch_incomplete");
      assertSourceBatchLimit(payload.accounts, "analytics_line_account_batch_too_large");
      for (const account of payload.accounts) {
        await applyLineAccountEvent(
          ctx,
          {
            kind: "lineAccount",
            staffId: account.staffId,
            linked: account.linked,
            following: account.following,
          },
          account.occurredAt,
          dataStartAt,
        );
      }
      return projectionComplete;
  }
}

/** fan-outしないeventをmutation内で直接適用するためのguard付きhelper。 */
export async function applySourceEvent(ctx: MutationCtx, event: Doc<"analyticsSourceEvents">, dataStartAt: number) {
  const result = await applySourceEventPage(ctx, event, dataStartAt);
  if (!result.done) throw new Error("analytics_projection_continuation_required");
}

type CutoffOpportunity = {
  staffId: Id<"staffs">;
  organizationPersonId?: Id<"organizationPeople">;
  firstSubmittedAt?: number;
  lineLinkedAtCutoff?: boolean;
};

async function collectCutoffOpportunities(ctx: MutationCtx, cycle: Doc<"analyticsShiftCycles">, at: number) {
  const memberships = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_shopId_and_role_and_validFrom", (q) =>
      q.eq("shopId", cycle.shopId).eq("role", "staff").lte("validFrom", at),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(memberships);
  const submissions = await ctx.db
    .query("shiftSubmissions")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", cycle.recruitmentId))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(submissions);

  const values = new Map<Id<"staffs">, CutoffOpportunity>();
  const activeStaffIds = new Set<Id<"staffs">>();
  for (const membership of memberships) {
    if (membership.role !== "staff" || !activeAt(membership, at)) continue;
    if (membership.organizationId !== cycle.organizationId) {
      throw new Error("analytics_cycle_membership_scope_invalid");
    }
    if (activeStaffIds.has(membership.staffId)) throw new Error("analytics_cycle_membership_overlap");
    activeStaffIds.add(membership.staffId);
    if (!membership.isShiftTarget) continue;
    values.set(membership.staffId, {
      staffId: membership.staffId,
      ...(membership.organizationPersonId ? { organizationPersonId: membership.organizationPersonId } : {}),
      lineLinkedAtCutoff: membership.lineLinked,
    });
  }
  for (const submission of submissions) {
    const firstSubmittedAt = submission.firstSubmittedAt ?? submission.submittedAt;
    if (firstSubmittedAt >= at) continue;
    const current = values.get(submission.staffId);
    values.set(submission.staffId, {
      staffId: submission.staffId,
      ...(current?.organizationPersonId ? { organizationPersonId: current.organizationPersonId } : {}),
      firstSubmittedAt: Math.min(current?.firstSubmittedAt ?? firstSubmittedAt, firstSubmittedAt),
      ...(current?.lineLinkedAtCutoff !== undefined ? { lineLinkedAtCutoff: current.lineLinkedAtCutoff } : {}),
    });
  }
  if (values.size > SCOPE_READ_LIMIT) throw new Error("analytics_cycle_opportunity_union_too_large");
  return values;
}

function isReminder(notificationContext: string | undefined) {
  return notificationContext?.toLowerCase().includes("reminder") ?? false;
}

async function collectCycleNotifications(ctx: MutationCtx, cycle: Doc<"analyticsShiftCycles">, closeAt: number) {
  const sent = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_recruitmentId_and_status_and_sentAt", (q) =>
      q
        .eq("recruitmentId", cycle.recruitmentId)
        .eq("status", "sent")
        .gte("sentAt", cycle.createdAt)
        .lt("sentAt", closeAt),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(sent);
  const failed = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_recruitmentId_and_status_and_failedAt", (q) =>
      q
        .eq("recruitmentId", cycle.recruitmentId)
        .eq("status", "failed")
        .gte("failedAt", cycle.createdAt)
        .lt("failedAt", closeAt),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(failed);
  const reminderByStaff = new Map<Id<"staffs">, number>();
  for (const notification of sent) {
    if (!notification.staffId || !isReminder(notification.notificationContext)) continue;
    reminderByStaff.set(notification.staffId, (reminderByStaff.get(notification.staffId) ?? 0) + 1);
  }
  return {
    sentCount: sent.length,
    failedCount: failed.length,
    reminderSentCount: sent.filter((notification) => isReminder(notification.notificationContext)).length,
    lastFailedAt: failed.reduce<number | undefined>(
      (latest, notification) =>
        notification.failedAt === undefined ? latest : Math.max(latest ?? 0, notification.failedAt),
      undefined,
    ),
    reminderByStaff,
  };
}

async function getCycleOpportunities(ctx: MutationCtx, recruitmentId: Id<"recruitments">) {
  const rows = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows);
  return rows;
}

/**
 * 一つのcycleをrun cutoff時点へ絶対収束させる。対象者は各業務cutoff時点の
 * shift targetとcutoff前submitterの和集合で、上限超過時は部分factを残さずthrowする。
 */
export async function finalizeCycleAtCutoff(
  ctx: MutationCtx,
  cycle: Doc<"analyticsShiftCycles">,
  dataStartAt: number,
  cutoffAt: number,
) {
  const existingOpportunities = await getCycleOpportunities(ctx, cycle.recruitmentId);
  if (cycle.createdAt < dataStartAt || cycle.deletedAt !== undefined) {
    for (const opportunity of existingOpportunities) await ctx.db.delete(opportunity._id);
    await ctx.db.patch(cycle._id, {
      targetAtDeadline: undefined,
      submittedAtDeadline: undefined,
      targetAtClose: undefined,
      submittedAtClose: undefined,
      notificationSentCount: 0,
      notificationFailedCount: 0,
      lastNotificationFailedAt: undefined,
      reminderSentCount: 0,
      completeness: "unavailable",
      finalizedAt: undefined,
      needsFinalizationAt: undefined,
    });
    return;
  }

  const closeAt = cycle.confirmedAt ?? getSubmitLinkCutoff(cycle.periodStart);
  const deadlineDue = cycle.submitDeadlineAt <= cutoffAt;
  const closeDue = closeAt <= cutoffAt;
  const complete = deadlineDue && closeDue;
  const needsFinalizationAt = [...(deadlineDue ? [] : [cycle.submitDeadlineAt]), ...(closeDue ? [] : [closeAt])].sort(
    (left, right) => left - right,
  )[0];
  const redactedOpportunities = existingOpportunities.filter((opportunity) => opportunity.identityState === "redacted");
  if (redactedOpportunities.length > 0) {
    for (const opportunity of existingOpportunities) {
      if (opportunity.identityState === "redacted") continue;
      await ctx.db.patch(opportunity._id, {
        staffId: undefined,
        organizationPersonId: undefined,
        identityState: "redacted",
      });
    }
    const notifications = closeDue
      ? await collectCycleNotifications(ctx, cycle, closeAt)
      : { sentCount: 0, failedCount: 0, reminderSentCount: 0, lastFailedAt: undefined };
    await ctx.db.patch(cycle._id, {
      targetAtDeadline: deadlineDue
        ? existingOpportunities.filter((opportunity) => opportunity.targetedAtDeadline).length
        : undefined,
      submittedAtDeadline: deadlineDue
        ? existingOpportunities.filter(
            (opportunity) =>
              opportunity.targetedAtDeadline &&
              opportunity.firstSubmittedAt !== undefined &&
              opportunity.firstSubmittedAt < cycle.submitDeadlineAt,
          ).length
        : undefined,
      targetAtClose: closeDue
        ? existingOpportunities.filter((opportunity) => opportunity.targetedAtClose).length
        : undefined,
      submittedAtClose: closeDue
        ? existingOpportunities.filter(
            (opportunity) =>
              opportunity.targetedAtClose &&
              opportunity.firstSubmittedAt !== undefined &&
              opportunity.firstSubmittedAt < closeAt,
          ).length
        : undefined,
      notificationSentCount: notifications.sentCount,
      notificationFailedCount: notifications.failedCount,
      lastNotificationFailedAt: notifications.lastFailedAt,
      reminderSentCount: notifications.reminderSentCount,
      completeness: complete ? "complete" : "unavailable",
      finalizedAt: complete ? Math.max(cycle.submitDeadlineAt, closeAt) : undefined,
      needsFinalizationAt,
    });
    return;
  }
  const deadline = deadlineDue ? await collectCutoffOpportunities(ctx, cycle, cycle.submitDeadlineAt) : new Map();
  const close = closeDue ? await collectCutoffOpportunities(ctx, cycle, closeAt) : new Map();
  const notifications = closeDue
    ? await collectCycleNotifications(ctx, cycle, closeAt)
    : { sentCount: 0, failedCount: 0, reminderSentCount: 0, lastFailedAt: undefined, reminderByStaff: new Map() };

  const existingByStaff = new Map<Id<"staffs">, (typeof existingOpportunities)[number]>();
  for (const opportunity of existingOpportunities) {
    if (!opportunity.staffId) continue;
    if (existingByStaff.has(opportunity.staffId)) throw new Error("analytics_cycle_opportunity_duplicate");
    existingByStaff.set(opportunity.staffId, opportunity);
  }
  const staffIds = new Set<Id<"staffs">>([...existingByStaff.keys(), ...deadline.keys(), ...close.keys()]);
  if (staffIds.size > SCOPE_READ_LIMIT) throw new Error("analytics_cycle_opportunity_union_too_large");
  const expiresAt = Math.max(cycle.submitDeadlineAt, closeAt) + OPPORTUNITY_RETENTION_MS;
  const identifiersExpired = expiresAt <= Date.now();
  for (const staffId of staffIds) {
    const existing = existingByStaff.get(staffId);
    const deadlineValue = deadline.get(staffId);
    const closeValue = close.get(staffId);
    const targetedAtDeadline = deadlineValue !== undefined;
    const targetedAtClose = closeValue !== undefined;
    if (!targetedAtDeadline && !targetedAtClose) {
      if (existing) await ctx.db.delete(existing._id);
      continue;
    }
    const firstSubmittedAt = [deadlineValue?.firstSubmittedAt, closeValue?.firstSubmittedAt]
      .filter((value): value is number => value !== undefined)
      .sort((left, right) => left - right)[0];
    const organizationPersonId = closeValue?.organizationPersonId ?? deadlineValue?.organizationPersonId;
    const lineLinkedAtCutoff = closeValue?.lineLinkedAtCutoff ?? deadlineValue?.lineLinkedAtCutoff;
    const value = {
      recruitmentId: cycle.recruitmentId,
      organizationId: cycle.organizationId,
      shopId: cycle.shopId,
      staffId,
      ...(organizationPersonId ? { organizationPersonId } : {}),
      targetedAtDeadline,
      targetedAtClose,
      ...(firstSubmittedAt !== undefined ? { firstSubmittedAt } : {}),
      ...(lineLinkedAtCutoff !== undefined ? { lineLinkedAtCutoff } : {}),
      reminderCount: notifications.reminderByStaff.get(staffId) ?? 0,
      completeness: "complete" as const,
      identityState: "active" as const,
      expiresAt,
    };
    if (identifiersExpired) {
      const redactedValue = {
        ...value,
        staffId: undefined,
        organizationPersonId: undefined,
        identityState: "redacted" as const,
      };
      if (existing) await ctx.db.replace(existing._id, redactedValue);
      else await ctx.db.insert("analyticsShiftCycleOpportunities", redactedValue);
      continue;
    }
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("analyticsShiftCycleOpportunities", value);
  }

  const deadlineSubmitted = [...deadline.values()].filter((value) => value.firstSubmittedAt !== undefined).length;
  const closeSubmitted = [...close.values()].filter((value) => value.firstSubmittedAt !== undefined).length;
  await ctx.db.patch(cycle._id, {
    targetAtDeadline: deadlineDue ? deadline.size : undefined,
    submittedAtDeadline: deadlineDue ? deadlineSubmitted : undefined,
    targetAtClose: closeDue ? close.size : undefined,
    submittedAtClose: closeDue ? closeSubmitted : undefined,
    notificationSentCount: notifications.sentCount,
    notificationFailedCount: notifications.failedCount,
    lastNotificationFailedAt: notifications.lastFailedAt,
    reminderSentCount: notifications.reminderSentCount,
    completeness: complete ? "complete" : "unavailable",
    finalizedAt: complete ? Math.max(cycle.submitDeadlineAt, closeAt) : undefined,
    needsFinalizationAt,
  });
}

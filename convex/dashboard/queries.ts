import type { GenericDatabaseReader, PaginationResult } from "convex/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { todayJST } from "../_lib/dateFormat";
import { authenticatedQuery, managerQuery } from "../_lib/functions";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import {
  DASHBOARD_ANNOUNCEMENT_CANDIDATE_LIMIT,
  DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT,
  DASHBOARD_OPEN_RECRUITMENT_SCAN_LIMIT,
  DASHBOARD_RECRUITMENT_CANDIDATE_GROUP_LIMIT,
  DASHBOARD_RESPONSE_COUNT_LIMIT,
} from "../constants";
import { resolveStaffLineRecipient } from "../line/service";
import {
  managerInvitationStateValidator,
  resolvePersonManagerInvitationState,
} from "../organization/managerInvitationState";
import { projectCanonicalDisplayPlanForClient, projectCanonicalPaidPlanForClient } from "../organization/queries";
import { getOrganizationBillingState, getOrganizationUsageSnapshot } from "../organization/service";
import { getOrganizationStaffOrderScope } from "../organization/staffOrder";
import {
  organizationMemberStatusValidator,
  organizationShopOperatingStatusValidator,
  planIdVersionValidator,
} from "../organization/validators";
import { TRIAL_ENDING_REMINDER_LEAD_MS } from "../organizationBilling/notification";
import {
  type CanonicalOrganizationBillingState,
  canonicalizeOrganizationPaidPlan,
  deriveOrganizationBillingPolicy,
} from "../organizationBilling/policy";
import { getOrganizationAccessPolicy, getOrganizationBillingPolicy } from "../organizationBilling/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { getStripeBillingConfiguration } from "../organizationStripe/config";

const myShopValidator = v.object({
  shopId: v.id("shops"),
  shopName: v.string(),
  shopStatus: organizationShopOperatingStatusValidator,
  organizationId: v.union(v.id("organizations"), v.null()),
  organizationName: v.union(v.string(), v.null()),
  organizationPlan: v.union(
    v.literal("trial"),
    v.literal("free"),
    v.literal("standard"),
    v.literal("pro"),
    v.literal("business"),
    v.null(),
  ),
  memberStatus: organizationMemberStatusValidator,
});

const dashboardStaffValidator = v.object({
  _id: v.id("staffs"),
  name: v.string(),
  email: v.string(),
  isManager: v.boolean(),
  isLineLinked: v.boolean(),
  isLineFollowing: v.boolean(),
  excludedFromShift: v.boolean(),
  isOrganizationLinked: v.boolean(),
  organizationPersonId: v.union(v.id("organizationPeople"), v.null()),
  managerInvitationState: managerInvitationStateValidator,
});

export const dashboardRecruitmentValidator = v.object({
  _id: v.id("recruitments"),
  createdAt: v.number(),
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  shopClosedDates: v.array(v.string()),
  status: v.union(v.literal("open"), v.literal("confirmed")),
  confirmedAt: v.union(v.number(), v.null()),
  responseCount: v.number(),
  responseCountHasOverflow: v.optional(v.boolean()),
  totalStaffCount: v.number(),
  totalStaffCountHasOverflow: v.optional(v.boolean()),
});

const dashboardAnnouncementValidator = v.object({
  _id: v.id("dashboardAnnouncements"),
  organizationId: v.optional(v.string()),
  shopId: v.optional(v.string()),
  organizationPlan: v.optional(v.string()),
  title: v.string(),
  bodyHtml: v.string(),
  displayDate: v.string(),
});

const currentUserValidator = v.union(
  v.object({
    accountDeleted: v.literal(true),
    accountDeletionRequested: v.boolean(),
  }),
  v.object({
    isNewUser: v.literal(true),
    name: v.string(),
    email: v.string(),
  }),
  v.object({
    isNewUser: v.literal(false),
    name: v.string(),
    email: v.string(),
    dashboardOnboardingDismissedAt: v.optional(v.number()),
  }),
);

const dashboardPlanStatusActionValidator = v.object({
  canManagePlan: v.boolean(),
  canUpdatePaymentMethod: v.boolean(),
});

const dashboardPlanStatusValidator = v.union(
  dashboardPlanStatusActionValidator.extend({
    kind: v.literal("trial"),
    trialEndsAt: v.number(),
    selectedPaidPlan: v.optional(v.union(v.literal("standard"), v.literal("pro"), v.literal("business"))),
  }),
  dashboardPlanStatusActionValidator.extend({
    kind: v.literal("freePlan"),
  }),
  dashboardPlanStatusActionValidator.extend({
    kind: v.literal("paidPlan"),
    plan: v.union(v.literal("standard"), v.literal("pro"), v.literal("business")),
    isComplimentary: v.boolean(),
    currentPeriodEndsAt: v.optional(v.number()),
    scheduledChange: v.optional(
      v.object({
        targetPlan: v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("business")),
        effectiveAt: v.number(),
        restrictAtPeriodEnd: v.optional(v.literal(true)),
      }),
    ),
  }),
  dashboardPlanStatusActionValidator.extend({
    kind: v.literal("paymentIssue"),
    plan: v.optional(v.union(v.literal("standard"), v.literal("pro"), v.literal("business"))),
    phase: v.literal("grace"),
    recoveryDeadlineAt: v.optional(v.number()),
  }),
  dashboardPlanStatusActionValidator.extend({
    kind: v.literal("paymentPending"),
    currentPlan: v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("business"), v.null()),
    targetPlan: v.union(v.literal("standard"), v.literal("pro"), v.literal("business")),
  }),
);

type DashboardPlanStatus = typeof dashboardPlanStatusValidator.type;
type DashboardPlanStatusActions = Pick<DashboardPlanStatus, "canManagePlan" | "canUpdatePaymentMethod">;

const dashboardPlanUsageItemValidator = v.object({
  current: v.number(),
  max: v.number(),
});

const dashboardPlanUsageValidator = v.object({
  peopleUsage: dashboardPlanUsageItemValidator,
  shopUsage: dashboardPlanUsageItemValidator,
  managerUsage: v.optional(dashboardPlanUsageItemValidator),
  pendingManagerInvitations: v.number(),
});

const dashboardUsageLimitViolationValidator = v.object({
  kind: v.union(v.literal("people"), v.literal("activeShops"), v.literal("activeManagers")),
  current: v.number(),
  max: v.number(),
  excess: v.number(),
  isLowerBound: v.optional(v.literal(true)),
});

const dashboardUsageLimitStatusValidator = v.union(
  v.object({
    kind: v.literal("overLimit"),
    evaluatedPlan: v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("business")),
    violations: v.array(dashboardUsageLimitViolationValidator),
  }),
  v.object({
    kind: v.literal("unknown"),
    evaluatedPlan: v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("business")),
  }),
);

const dashboardShopValidator = v.object({
  name: v.string(),
  regularClosedDays: v.array(
    v.union(
      v.literal("sun"),
      v.literal("mon"),
      v.literal("tue"),
      v.literal("wed"),
      v.literal("thu"),
      v.literal("fri"),
      v.literal("sat"),
    ),
  ),
  submissionPattern: submissionPatternValidator,
  canWriteBusinessData: v.boolean(),
  businessWriteBlockReason: v.union(
    v.literal("paymentResultPending"),
    v.literal("usageLimitExceeded"),
    v.literal("usageLimitEvaluationUnavailable"),
    v.null(),
  ),
  // rolling deploy中の旧frontendは未知の任意fieldを無視できる。
  usageLimitStatus: v.optional(dashboardUsageLimitStatusValidator),
  // TODO[narrow]: planStatusを返すbackendが全deploymentへ反映され、旧frontend互換期間が終わった後にrequired化する。
  planStatus: v.optional(v.union(dashboardPlanStatusValidator, v.null())),
  trialEndingNotice: v.union(
    v.object({
      visibleFrom: v.number(),
      trialEndsAt: v.number(),
    }),
    v.null(),
  ),
});

function getDashboardPlanStatusActions(args: {
  billingState: CanonicalOrganizationBillingState;
  organizationMember: Doc<"organizationMembers"> | null;
  stripeCustomer: Doc<"organizationStripeCustomers"> | null;
}): DashboardPlanStatusActions {
  const configuration = getStripeBillingConfiguration();
  const isActiveManager = args.organizationMember?.status === "active";
  const stripeBillingAvailable = configuration.status === "ready";
  const stripeCustomerMatchesConfiguration = Boolean(
    configuration.status === "ready" && args.stripeCustomer?.livemode === configuration.livemode,
  );
  const canManagePlan = Boolean(
    stripeBillingAvailable &&
      args.billingState.kind !== "complimentary" &&
      isActiveManager &&
      args.billingState.kind !== "initialPaymentPending" &&
      args.billingState.kind !== "pendingActivation",
  );
  const canAccessCustomerPortal = Boolean(
    isActiveManager &&
      ((args.billingState.kind === "trial" && args.billingState.selectedPaidPlan !== undefined) ||
        args.billingState.kind === "scheduledChange" ||
        args.billingState.kind === "grace" ||
        (args.billingState.kind === "active" && args.billingState.plan !== "free")),
  );

  return {
    canManagePlan,
    canUpdatePaymentMethod: Boolean(
      stripeBillingAvailable &&
        stripeCustomerMatchesConfiguration &&
        args.billingState.kind !== "complimentary" &&
        canAccessCustomerPortal,
    ),
  };
}

function getCurrentPeriodEndsAt(
  subscription: Doc<"organizationStripeSubscriptions"> | null,
  expectedPlan: "standard" | "pro",
) {
  let subscriptionPlan: "standard" | "pro" | null = null;
  if (subscription?.plan) {
    try {
      subscriptionPlan = canonicalizeOrganizationPaidPlan(subscription.plan, subscription.planIdVersion);
    } catch {
      // 不整合なsnapshotは更新日の表示根拠にせず、課金state本体の表示は継続する。
    }
  }
  if (
    !subscription ||
    subscription.terminalAt !== undefined ||
    subscription.currentPeriodEndsAt === undefined ||
    subscriptionPlan !== expectedPlan
  ) {
    return undefined;
  }
  return subscription.currentPeriodEndsAt;
}

function toDashboardPlanStatus(args: {
  billingState: CanonicalOrganizationBillingState;
  organizationMember: Doc<"organizationMembers"> | null;
  stripeCustomer: Doc<"organizationStripeCustomers"> | null;
  latestStripeSubscription: Doc<"organizationStripeSubscriptions"> | null;
}): DashboardPlanStatus {
  const actions = getDashboardPlanStatusActions(args);
  const state = args.billingState;
  switch (state.kind) {
    case "trial":
      return {
        ...actions,
        kind: "trial",
        trialEndsAt: state.trialEndsAt,
        ...(state.selectedPaidPlan ? { selectedPaidPlan: state.selectedPaidPlan } : {}),
      };
    case "initialPaymentPending":
      return {
        ...actions,
        kind: "paymentPending",
        currentPlan: "standard",
        targetPlan: state.plan,
      };
    case "pendingActivation":
      return {
        ...actions,
        kind: "paymentPending",
        currentPlan:
          state.fallback === "free" || state.fallback === "standard" || state.fallback === "pro"
            ? state.fallback
            : null,
        targetPlan: state.plan,
      };
    case "active": {
      if (state.plan === "free") return { ...actions, kind: "freePlan" };
      const activeCurrentPeriodEndsAt = getCurrentPeriodEndsAt(args.latestStripeSubscription, state.plan);
      return {
        ...actions,
        kind: "paidPlan",
        plan: state.plan,
        isComplimentary: false,
        ...(activeCurrentPeriodEndsAt !== undefined ? { currentPeriodEndsAt: activeCurrentPeriodEndsAt } : {}),
      };
    }
    case "complimentary":
      return {
        ...actions,
        kind: "paidPlan",
        plan: "pro",
        isComplimentary: true,
      };
    case "scheduledChange": {
      const scheduledCurrentPeriodEndsAt = getCurrentPeriodEndsAt(args.latestStripeSubscription, state.currentPlan);
      return {
        ...actions,
        kind: "paidPlan",
        plan: state.currentPlan,
        isComplimentary: false,
        ...(scheduledCurrentPeriodEndsAt !== undefined ? { currentPeriodEndsAt: scheduledCurrentPeriodEndsAt } : {}),
        scheduledChange: {
          targetPlan: state.targetPlan,
          effectiveAt: state.effectiveAt,
          ...(state.targetPlan === "free" && state.restrictAtPeriodEnd === true
            ? { restrictAtPeriodEnd: true as const }
            : {}),
        },
      };
    }
    case "grace":
      return {
        ...actions,
        kind: "paymentIssue",
        plan: state.plan,
        phase: "grace",
        recoveryDeadlineAt: state.endsAt,
      };
  }
}

function projectDashboardPlanStatusForClient(status: DashboardPlanStatus, planIdVersion?: 2): DashboardPlanStatus {
  if (planIdVersion === 2) return status;

  switch (status.kind) {
    case "trial":
      return {
        ...status,
        ...(status.selectedPaidPlan === undefined
          ? {}
          : {
              selectedPaidPlan:
                status.selectedPaidPlan === "business"
                  ? status.selectedPaidPlan
                  : projectCanonicalPaidPlanForClient(status.selectedPaidPlan, planIdVersion),
            }),
      };
    case "freePlan":
      return status;
    case "paidPlan":
      return {
        ...status,
        plan: status.plan === "business" ? status.plan : projectCanonicalPaidPlanForClient(status.plan, planIdVersion),
        ...(status.scheduledChange === undefined
          ? {}
          : {
              scheduledChange: {
                ...status.scheduledChange,
                targetPlan:
                  status.scheduledChange.targetPlan === "business"
                    ? status.scheduledChange.targetPlan
                    : projectCanonicalDisplayPlanForClient(status.scheduledChange.targetPlan, planIdVersion),
              },
            }),
      };
    case "paymentIssue":
      return {
        ...status,
        ...(status.plan === undefined
          ? {}
          : {
              plan:
                status.plan === "business"
                  ? status.plan
                  : projectCanonicalPaidPlanForClient(status.plan, planIdVersion),
            }),
      };
    case "paymentPending":
      return {
        ...status,
        currentPlan:
          status.currentPlan === null
            ? null
            : status.currentPlan === "business"
              ? status.currentPlan
              : projectCanonicalDisplayPlanForClient(status.currentPlan, planIdVersion),
        targetPlan:
          status.targetPlan === "business"
            ? status.targetPlan
            : projectCanonicalPaidPlanForClient(status.targetPlan, planIdVersion),
      };
  }
}

// shop未登録のsetup中や、ログアウト直後に購読中queryが未認証で再実行された場合でも
// エラーログを出さないための空結果（queryはthrowせず空を返す規約）
const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};

async function getTotalStaffCount(ctx: { db: GenericDatabaseReader<DataModel> }, shopId: Doc<"shops">["_id"]) {
  const activeStaffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .collect();
  // シフト対象外スタッフは提出率の母数に含めない。
  return activeStaffs.filter((s) => !s.excludedFromShift).length;
}

export async function toDashboardRecruitment(
  ctx: { db: GenericDatabaseReader<DataModel> },
  recruitment: Doc<"recruitments">,
  totalStaffCount: number,
  options?: { legacySubmissionCountLimit?: number },
) {
  // 回答数は shiftSubmissions を正とする。
  // 全日休み提出では明細が0件になるため、提出記録を数えないと未提出扱いになってしまう。
  const stats = await ctx.db
    .query("recruitmentStats")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
    .first();
  const legacySubmissionCountLimit = options?.legacySubmissionCountLimit ?? DASHBOARD_RESPONSE_COUNT_LIMIT;
  if (
    !Number.isSafeInteger(legacySubmissionCountLimit) ||
    legacySubmissionCountLimit < 1 ||
    legacySubmissionCountLimit > DASHBOARD_RESPONSE_COUNT_LIMIT
  ) {
    throw new Error(`legacySubmissionCountLimit must be between 1 and ${DASHBOARD_RESPONSE_COUNT_LIMIT}`);
  }
  const legacySubmissionReadLimit = Math.min(totalStaffCount, legacySubmissionCountLimit + 1);
  const submissions =
    stats || legacySubmissionReadLimit === 0
      ? []
      : await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
          .take(legacySubmissionReadLimit);
  const responseCountHasOverflow = !stats && submissions.length > legacySubmissionCountLimit;
  return {
    _id: recruitment._id,
    createdAt: recruitment._creationTime,
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
    deadline: recruitment.deadline,
    // TODO[narrow]: 全deploymentでm040が完走し、
    // verifyRecruitments.missingShopClosedDatesが0件になった後にfallbackを削除する。
    shopClosedDates: recruitment.shopClosedDates ?? [],
    status: recruitment.status,
    confirmedAt: recruitment.confirmedAt ?? null,
    // 提出数は対象外スタッフの提出も含みうるため、母数（対象外を除いた総数）を上限にクランプし、
    // 「3/2人」のような不可能な比率が表示されないようにする。
    responseCount: Math.min(
      stats?.submittedCount ?? Math.min(submissions.length, legacySubmissionCountLimit),
      totalStaffCount,
    ),
    ...(responseCountHasOverflow ? { responseCountHasOverflow: true } : {}),
    totalStaffCount,
  };
}

async function getCurrentRecruitmentDocs(ctx: { db: GenericDatabaseReader<DataModel> }, shopId: Doc<"shops">["_id"]) {
  const today = todayJST();
  const candidates = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
      q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "confirmed").lte("periodStart", today),
    )
    .order("desc")
    .take(DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT);
  return candidates
    .filter((recruitment) => recruitment.periodEnd >= today)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || b._creationTime - a._creationTime);
}

async function getNonPastConfirmedRecruitmentDocs(
  ctx: { db: GenericDatabaseReader<DataModel> },
  shopId: Doc<"shops">["_id"],
) {
  const today = todayJST();
  return await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
      q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "confirmed").gte("periodEnd", today),
    )
    .order("asc")
    .take(DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT);
}

export async function getDashboardRecruitmentCandidateDocs(
  ctx: { db: GenericDatabaseReader<DataModel> },
  shopId: Doc<"shops">["_id"],
  groupLimit: number,
) {
  const today = todayJST();
  const [currentRecruitments, openRecruitmentCandidates, futureConfirmedRecruitments] = await Promise.all([
    getCurrentRecruitmentDocs(ctx, shopId),
    ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
        q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "open").gte("periodEnd", today),
      )
      .order("asc")
      .take(DASHBOARD_OPEN_RECRUITMENT_SCAN_LIMIT),
    ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
        q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "confirmed").gt("periodStart", today),
      )
      .order("asc")
      .take(groupLimit),
  ]);

  const actionRequiredRecruitments = openRecruitmentCandidates
    .filter((recruitment) => recruitment.deadline < today)
    .sort(
      (a, b) =>
        a.deadline.localeCompare(b.deadline) ||
        a.periodStart.localeCompare(b.periodStart) ||
        b._creationTime - a._creationTime,
    )
    .slice(0, groupLimit);
  const collectingRecruitments = openRecruitmentCandidates
    .filter((recruitment) => recruitment.deadline >= today)
    .sort(
      (a, b) =>
        a.deadline.localeCompare(b.deadline) ||
        a.periodStart.localeCompare(b.periodStart) ||
        b._creationTime - a._creationTime,
    )
    .slice(0, groupLimit);

  const uniqueRecruitments = new Map<Doc<"recruitments">["_id"], Doc<"recruitments">>();
  for (const recruitment of [
    ...currentRecruitments,
    ...actionRequiredRecruitments,
    ...collectingRecruitments,
    ...futureConfirmedRecruitments,
  ]) {
    uniqueRecruitments.set(recruitment._id, recruitment);
  }
  return Array.from(uniqueRecruitments.values());
}

async function getActiveDashboardAnnouncementCandidates(db: GenericDatabaseReader<DataModel>) {
  return await db
    .query("dashboardAnnouncements")
    .withIndex("by_isPublished_and_isDeleted_and_displayDate", (q) => q.eq("isPublished", true).eq("isDeleted", false))
    .order("desc")
    .take(DASHBOARD_ANNOUNCEMENT_CANDIDATE_LIMIT);
}

function normalizeDashboardAnnouncementPlanTargets(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((target) => target.trim())
        .filter(Boolean),
    ),
  ].join(",");
}

function projectDashboardAnnouncementPlanTargets(args: {
  value: string;
  storedPlanIdVersion?: 2;
  clientPlanIdVersion?: 2;
}) {
  const canonicalTargets = normalizeDashboardAnnouncementPlanTargets(args.value)
    .split(",")
    .map((target) =>
      args.storedPlanIdVersion === 2 ? target : target === "pro" ? "standard" : target === "business" ? "pro" : target,
    );
  const clientTargets = canonicalTargets.map((target) =>
    args.clientPlanIdVersion === 2 ? target : target === "standard" ? "pro" : target === "pro" ? "business" : target,
  );
  return [...new Set(clientTargets)].join(",");
}

function toDashboardAnnouncement(announcement: Doc<"dashboardAnnouncements">, planIdVersion?: 2) {
  return {
    _id: announcement._id,
    ...(announcement.organizationId !== undefined ? { organizationId: announcement.organizationId } : {}),
    ...(announcement.shopId !== undefined ? { shopId: announcement.shopId } : {}),
    ...(announcement.organizationPlan !== undefined
      ? {
          organizationPlan: projectDashboardAnnouncementPlanTargets({
            value: announcement.organizationPlan,
            storedPlanIdVersion: announcement.planIdVersion,
            clientPlanIdVersion: planIdVersion,
          }),
        }
      : {}),
    title: announcement.title,
    bodyHtml: announcement.bodyHtml,
    displayDate: announcement.displayDate,
  };
}

export const getDashboardShop = managerQuery({
  args: { planIdVersion: v.optional(planIdVersionValidator) },
  returns: v.union(dashboardShopValidator, v.null()),
  handler: async (ctx, args) => {
    const shop = ctx.shop;
    if (!shop) return null;
    const organizationId = ctx.organization?._id;
    const accessPolicy = organizationId ? await getOrganizationAccessPolicy(ctx, organizationId) : null;
    const billingState = accessPolicy?.billingState ?? null;
    const [stripeCustomer, latestStripeSubscription] = organizationId
      ? await Promise.all([
          ctx.db
            .query("organizationStripeCustomers")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
            .unique(),
          ctx.db
            .query("organizationStripeSubscriptions")
            .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
            .order("desc")
            .first(),
        ])
      : [null, null];
    const trialEndingNotice =
      billingState?.state.kind === "trial" && billingState.state.selectedPaidPlan === undefined
        ? {
            visibleFrom: billingState.state.trialEndsAt - TRIAL_ENDING_REMINDER_LEAD_MS,
            trialEndsAt: billingState.state.trialEndsAt,
          }
        : null;

    return {
      name: shop.name,
      // TODO[narrow]: 全deploymentでm039のshop workerが完走し、
      // verifyShops.missingRegularClosedDaysが0件になった後にfallbackを削除する。
      regularClosedDays: shop.regularClosedDays ?? [],
      submissionPattern: shop.submissionPattern,
      // TODO[narrow]: 全deploymentでm025完走・verifyOrganizationsのbilling state残件0確認後にfallbackを外す。
      // 課金state未作成の移行中orgは、managerMutationの旧導線互換と同じく許可扱いにする。
      canWriteBusinessData: accessPolicy?.canWriteBusinessData ?? true,
      businessWriteBlockReason:
        accessPolicy?.usageLimitStatus?.kind === "unknown"
          ? ("usageLimitEvaluationUnavailable" as const)
          : (accessPolicy?.businessWriteBlockReason ?? null),
      ...(accessPolicy?.usageLimitStatus?.kind === "overLimit"
        ? {
            usageLimitStatus: {
              kind: "overLimit" as const,
              evaluatedPlan: projectCanonicalDisplayPlanForClient(
                accessPolicy.usageLimitStatus.evaluatedPlan,
                args.planIdVersion,
              ),
              violations: accessPolicy.usageLimitStatus.violations,
            },
          }
        : accessPolicy?.usageLimitStatus?.kind === "unknown"
          ? {
              usageLimitStatus: {
                kind: "unknown" as const,
                evaluatedPlan: projectCanonicalDisplayPlanForClient(
                  accessPolicy.usageLimitStatus.evaluatedPlan,
                  args.planIdVersion,
                ),
              },
            }
          : {}),
      planStatus: billingState
        ? projectDashboardPlanStatusForClient(
            toDashboardPlanStatus({
              billingState: billingState.state,
              organizationMember: ctx.organizationMember,
              stripeCustomer,
              latestStripeSubscription,
            }),
            args.planIdVersion,
          )
        : null,
      trialEndingNotice,
    };
  },
});

export const getDashboardPlanUsage = managerQuery({
  args: { now: v.number() },
  returns: v.union(dashboardPlanUsageValidator, v.null()),
  handler: async (ctx, args) => {
    const organization = ctx.organization;
    if (!organization) return null;

    const billingState = await getOrganizationBillingState(ctx, organization._id);
    if (!billingState) return null;

    const policy = deriveOrganizationBillingPolicy(billingState.state);
    const limits = policy.limits;
    if (!limits) return null;

    const usage = await getOrganizationUsageSnapshot(ctx, organization._id, args.now);
    return {
      peopleUsage: {
        current: usage.personCount,
        max: limits.maxPeople,
      },
      shopUsage: {
        current: usage.activeShopCount,
        max: limits.maxActiveShops,
      },
      managerUsage: {
        current: usage.activeManagerCount,
        max: limits.maxActiveManagers,
      },
      pendingManagerInvitations: usage.pendingManagerInvitationCount,
    };
  },
});

/**
 * ログインユーザーが所属する全店舗を返す。
 * 複数店舗マネージャーが操作対象店舗を選ぶための一覧（フロントの selectedShopAtom 初期化に使う）。
 */
export const getMyShops = authenticatedQuery({
  args: { planIdVersion: v.optional(planIdVersionValidator) },
  returns: v.array(myShopValidator),
  handler: async (ctx, args) => {
    if (!ctx.identity || !ctx.user || ctx.user.isDeleted) return [];
    const user = ctx.user;
    const result = new Map<
      Doc<"shops">["_id"],
      {
        shopId: Doc<"shops">["_id"];
        shopName: string;
        shopStatus: "active" | "archived";
        organizationId: Doc<"organizations">["_id"] | null;
        organizationName: string | null;
        organizationPlan: "trial" | "free" | "standard" | "pro" | null;
        memberStatus: "active" | "removed";
      }
    >();

    const organizationMemberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", "active"))
      .collect();
    for (const membership of organizationMemberships) {
      const membershipsForOrganization = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", user._id).eq("organizationId", membership.organizationId),
        )
        .take(2);
      if (membershipsForOrganization.length !== 1 || membershipsForOrganization[0]._id !== membership._id) continue;

      const [organization, person] = await Promise.all([
        ctx.db.get(membership.organizationId),
        ctx.db.get(membership.personId),
      ]);
      if (
        !organization ||
        organization.isDeleted ||
        !person ||
        person.status !== "active" ||
        person.organizationId !== organization._id ||
        person.userId !== user._id
      ) {
        continue;
      }
      const organizationPlan = (await getOrganizationBillingPolicy(ctx, organization._id))?.targetingPlan ?? null;

      const shops = await ctx.db
        .query("shops")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .collect();
      for (const shop of shops) {
        if (shop.isDeleted) continue;
        result.set(shop._id, {
          shopId: shop._id,
          shopName: shop.name,
          // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後にfallbackを削除する。
          shopStatus: shop.operatingStatus ?? "active",
          organizationId: organization._id,
          organizationName: organization.name,
          organizationPlan,
          memberStatus: membership.status,
        });
      }
    }

    // TODO[narrow]: 全deploymentでm025/m029が完走し、verifyShops/verifyLegacyShopMembersの
    //   全pageが0件になった後、このlegacyMemberships fallbackを削除する。
    const legacyMemberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
      .collect();
    const legacyMembershipCountByShopId = new Map<Id<"shops">, number>();
    for (const membership of legacyMemberships) {
      legacyMembershipCountByShopId.set(
        membership.shopId,
        (legacyMembershipCountByShopId.get(membership.shopId) ?? 0) + 1,
      );
    }
    for (const membership of legacyMemberships) {
      if (result.has(membership.shopId)) continue;
      if (legacyMembershipCountByShopId.get(membership.shopId) !== 1) continue;
      const shop = await ctx.db.get(membership.shopId);
      if (!shop || shop.isDeleted) continue;

      if (!shop.organizationId) {
        result.set(shop._id, {
          shopId: shop._id,
          shopName: shop.name,
          // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後にfallbackを削除する。
          shopStatus: shop.operatingStatus ?? "active",
          organizationId: null,
          organizationName: null,
          organizationPlan: null,
          memberStatus: "active",
        });
        continue;
      }

      // m009完了後/m010完了前だけは、該当店舗一件に限って旧所属を読む。
      // organizationMembersが存在する場合はremovedを旧所属で上書きしない。
      const organizationId = shop.organizationId;
      const organizationMemberships = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", user._id).eq("organizationId", organizationId))
        .take(2);
      if (organizationMemberships.length !== 0) continue;
      const organization = await ctx.db.get(organizationId);
      if (!organization || organization.isDeleted) continue;
      const organizationPlan = (await getOrganizationBillingPolicy(ctx, organization._id))?.targetingPlan ?? null;
      result.set(shop._id, {
        shopId: shop._id,
        shopName: shop.name,
        // TODO[narrow]: 全deploymentでm025完走・verifyShopsのstatus残件0確認後にfallbackを削除する。
        shopStatus: shop.operatingStatus ?? "active",
        organizationId: organization._id,
        organizationName: organization.name,
        organizationPlan,
        memberStatus: "active",
      });
    }

    return [...result.values()]
      .sort(
        (a, b) =>
          (a.organizationName ?? "").localeCompare(b.organizationName ?? "", "ja") ||
          a.shopName.localeCompare(b.shopName, "ja"),
      )
      .map((shop) => ({
        ...shop,
        organizationPlan:
          shop.organizationPlan === null
            ? null
            : projectCanonicalDisplayPlanForClient(shop.organizationPlan, args.planIdVersion),
      }));
  },
});

// 旧フロントとのdeploy互換用。対象指定のある本文を誤表示しないよう、全体向けだけを返す。
export const getActiveDashboardAnnouncement = authenticatedQuery({
  args: {},
  returns: v.union(dashboardAnnouncementValidator, v.null()),
  handler: async (ctx) => {
    if (!ctx.identity || ctx.user?.isDeleted) return null;

    const announcement = (await getActiveDashboardAnnouncementCandidates(ctx.db)).find(
      (candidate) =>
        candidate.organizationId === undefined &&
        candidate.shopId === undefined &&
        candidate.organizationPlan === undefined,
    );
    if (!announcement) return null;

    return {
      _id: announcement._id,
      title: announcement.title,
      bodyHtml: announcement.bodyHtml,
      displayDate: announcement.displayDate,
    };
  },
});

// プラン対象を知らない直前版フロントとのdeploy互換用。
// plan-only行はorg/shop未指定を全体向けと誤認されるため除外し、V2だけへ返す。
export const getActiveDashboardAnnouncements = authenticatedQuery({
  args: {},
  returns: v.array(dashboardAnnouncementValidator),
  handler: async (ctx) => {
    if (!ctx.identity || ctx.user?.isDeleted) return [];

    const announcements = await getActiveDashboardAnnouncementCandidates(ctx.db);

    return announcements
      .filter(
        (announcement) =>
          announcement.organizationPlan === undefined ||
          announcement.organizationId !== undefined ||
          announcement.shopId !== undefined,
      )
      .map((announcement) => toDashboardAnnouncement(announcement));
  },
});

// 対象値は表示制御用であり、認可境界ではない。本文は全認証ユーザーへ返るため機密情報を登録しない。
export const getActiveDashboardAnnouncementsV2 = authenticatedQuery({
  args: { planIdVersion: v.optional(planIdVersionValidator) },
  returns: v.array(dashboardAnnouncementValidator),
  handler: async (ctx, args) => {
    if (!ctx.identity || ctx.user?.isDeleted) return [];

    const announcements = await getActiveDashboardAnnouncementCandidates(ctx.db);
    return announcements.map((announcement) => toDashboardAnnouncement(announcement, args.planIdVersion));
  },
});

export const getDashboardRecruitments = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(dashboardRecruitmentValidator),
  handler: async (ctx, args) => {
    const shop = ctx.shop;
    if (!shop) return EMPTY_PAGE;

    const groupLimit = Math.max(args.paginationOpts.numItems, DASHBOARD_RECRUITMENT_CANDIDATE_GROUP_LIMIT);
    const recruitments = await getDashboardRecruitmentCandidateDocs(ctx, shop._id, groupLimit);
    const totalStaffCount = await getTotalStaffCount(ctx, shop._id);

    const page = await Promise.all(
      recruitments.map((recruitment) => toDashboardRecruitment(ctx, recruitment, totalStaffCount)),
    );

    return {
      page,
      isDone: true,
      continueCursor: "",
    };
  },
});

export const hasDashboardPastRecruitments = managerQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const shop = ctx.shop;
    if (!shop) return false;

    const today = todayJST();
    const pastRecruitment = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_periodEnd", (q) =>
        q.eq("shopId", shop._id).eq("isDeleted", false).lt("periodEnd", today),
      )
      .order("desc")
      .first();
    return pastRecruitment !== null;
  },
});

export const getDashboardPastRecruitments = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(dashboardRecruitmentValidator),
  handler: async (ctx, args) => {
    const shop = ctx.shop;
    if (!shop) return EMPTY_PAGE;

    const today = todayJST();
    const paginatedResult = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_periodEnd", (q) =>
        q.eq("shopId", shop._id).eq("isDeleted", false).lt("periodEnd", today),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const totalStaffCount = await getTotalStaffCount(ctx, shop._id);

    const page = await Promise.all(
      paginatedResult.page.map((recruitment) => toDashboardRecruitment(ctx, recruitment, totalStaffCount)),
    );

    return {
      ...paginatedResult,
      page,
    };
  },
});

export const getDashboardCurrentRecruitments = managerQuery({
  args: {},
  returns: v.array(dashboardRecruitmentValidator),
  handler: async (ctx) => {
    const shop = ctx.shop;
    if (!shop) return [];

    const currentRecruitments = await getNonPastConfirmedRecruitmentDocs(ctx, shop._id);
    const totalStaffCount = await getTotalStaffCount(ctx, shop._id);

    return await Promise.all(
      currentRecruitments.map(async (recruitment) => toDashboardRecruitment(ctx, recruitment, totalStaffCount)),
    );
  },
});

const staffOrderScopeValidator = v.union(
  v.object({ mode: v.literal("legacy") }),
  v.object({ mode: v.literal("ordered"), revision: v.number() }),
);

export const getDashboardStaffOrderScope = managerQuery({
  args: {},
  returns: staffOrderScopeValidator,
  handler: async (ctx) => {
    const shop = ctx.shop;
    const organization = ctx.organization;
    if (!shop || !organization || shop.organizationId !== organization._id) return { mode: "legacy" as const };
    return await getOrganizationStaffOrderScope(ctx, {
      organizationId: organization._id,
      shopId: shop._id,
    });
  },
});

export const getDashboardStaffs = managerQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    orderRevision: v.optional(v.union(v.number(), v.null())),
  },
  returns: paginationResultValidator(dashboardStaffValidator),
  handler: async (ctx, args) => {
    const shop = ctx.shop;
    if (!shop) return EMPTY_PAGE;

    const organization = ctx.organization;
    const organizationMember = ctx.organizationMember;
    const now = Date.now();
    const [billingState, usage, pendingInvitations] = organization
      ? await Promise.all([
          getOrganizationBillingState(ctx, organization._id),
          getOrganizationUsageSnapshot(ctx, organization._id, now),
          collectIssuedInvitationsByOrganization(ctx, organization._id),
        ])
      : [null, null, []];
    const activePendingInvitations = pendingInvitations.filter((invitation) => invitation.expiresAt > now);
    const useOrderedIndex = args.orderRevision !== undefined && args.orderRevision !== null;
    if (useOrderedIndex && (!Number.isSafeInteger(args.orderRevision) || (args.orderRevision as number) < 1)) {
      throw new ConvexError("orderRevision must be a positive safe integer");
    }

    let paginatedResult: PaginationResult<Doc<"staffs">>;
    if (useOrderedIndex) {
      if (!organization || shop.organizationId !== organization._id) return EMPTY_PAGE;
      const scope = await getOrganizationStaffOrderScope(ctx, {
        organizationId: organization._id,
        shopId: shop._id,
      });
      if (scope.mode !== "ordered" || scope.revision !== args.orderRevision) return EMPTY_PAGE;
      const entries = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shop._id))
        .paginate(args.paginationOpts);
      const staffs = (
        await Promise.all(
          entries.page.map(async (entry) => {
            if (entry.organizationId !== organization._id || entry.shopId !== shop._id) return null;
            const staff = await ctx.db.get(entry.staffId);
            if (
              !staff ||
              staff.isDeleted ||
              staff.shopId !== shop._id ||
              staff.organizationId !== organization._id ||
              staff.organizationPersonId !== entry.organizationPersonId
            ) {
              return null;
            }
            const person = await ctx.db.get(entry.organizationPersonId);
            return person?.organizationId === organization._id && person.status === "active" ? staff : null;
          }),
        )
      ).filter((staff): staff is Doc<"staffs"> => staff !== null);
      paginatedResult = { ...entries, page: staffs };
    } else {
      paginatedResult = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .paginate(args.paginationOpts);
    }

    const page = await Promise.all(
      paginatedResult.page.map(async (s) => {
        const lineAccount = await resolveStaffLineRecipient(ctx, { staffId: s._id, shopId: shop._id });
        const isOrganizationLinked = Boolean(
          organization && s.organizationId === organization._id && s.organizationPersonId,
        );
        const person = isOrganizationLinked && s.organizationPersonId ? await ctx.db.get(s.organizationPersonId) : null;
        const members =
          person && organization && person.organizationId === organization._id
            ? await ctx.db
                .query("organizationMembers")
                .withIndex("by_organizationId_and_personId", (q) =>
                  q.eq("organizationId", organization._id).eq("personId", person._id),
                )
                .take(2)
            : [];
        const isManager = members.length === 1 && members[0].status === "active";
        const managerInvitationState = await resolvePersonManagerInvitationState(ctx, {
          organization,
          actorMember: organizationMember,
          person,
          personMembers: members,
          contactEmail: s.email,
          isOrganizationLinked,
          billingState,
          usage,
          activePendingInvitations,
        });
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          isManager,
          isLineLinked: Boolean(lineAccount?.lineUserId),
          isLineFollowing: Boolean(lineAccount?.following),
          // TODO[narrow]: 全deploymentでm027完走・missingExcludedFromShift=0確認後にfallbackを外す。
          excludedFromShift: s.excludedFromShift ?? false,
          isOrganizationLinked,
          organizationPersonId:
            person && organization && person.organizationId === organization._id && person.status === "active"
              ? person._id
              : null,
          managerInvitationState,
        };
      }),
    );

    return {
      ...paginatedResult,
      page,
    };
  },
});

export const getCurrentUser = authenticatedQuery({
  args: {},
  returns: v.union(currentUserValidator, v.null()),
  handler: async (ctx) => {
    const { identity, user } = ctx;
    if (!identity) return null;
    if (user?.isDeleted || user?.accountDeletionRequestedAt !== undefined) {
      return {
        accountDeleted: true as const,
        accountDeletionRequested: user.accountDeletionRequestedAt !== undefined,
      };
    }
    if (!user) {
      return {
        isNewUser: true as const,
        name: identity.name ?? "",
        email: identity.email ?? "",
      };
    }
    return {
      isNewUser: false as const,
      name: user.name,
      email: user.email,
      dashboardOnboardingDismissedAt: user.dashboardOnboardingDismissedAt,
    };
  },
});

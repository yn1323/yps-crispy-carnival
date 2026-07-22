import type { GenericDatabaseReader } from "convex/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
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
import { getStaffLineAccount } from "../line/service";
import {
  managerInvitationStateValidator,
  resolvePersonManagerInvitationState,
} from "../organization/managerInvitationState";
import { getOrganizationBillingState, getOrganizationUsageSnapshot } from "../organization/service";
import {
  organizationMemberStatusValidator,
  organizationShopOperatingStatusValidator,
} from "../organization/validators";
import { TRIAL_ENDING_REMINDER_LEAD_MS } from "../organizationBilling/notification";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import { getOrganizationBillingPolicy } from "../organizationBilling/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";

const myShopValidator = v.object({
  shopId: v.id("shops"),
  shopName: v.string(),
  shopStatus: organizationShopOperatingStatusValidator,
  organizationId: v.union(v.id("organizations"), v.null()),
  organizationName: v.union(v.string(), v.null()),
  organizationPlan: v.union(v.literal("trial"), v.literal("free"), v.literal("pro"), v.literal("business"), v.null()),
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

const dashboardRecruitmentValidator = v.object({
  _id: v.id("recruitments"),
  createdAt: v.number(),
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  shopClosedDates: v.array(v.string()),
  status: v.union(v.literal("open"), v.literal("confirmed")),
  confirmedAt: v.union(v.number(), v.null()),
  responseCount: v.number(),
  totalStaffCount: v.number(),
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
  businessWriteBlockReason: v.union(v.literal("paymentResultPending"), v.literal("restricted"), v.null()),
  trialEndingNotice: v.union(
    v.object({
      visibleFrom: v.number(),
      trialEndsAt: v.number(),
    }),
    v.null(),
  ),
});

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

async function toDashboardRecruitment(
  ctx: { db: GenericDatabaseReader<DataModel> },
  recruitment: Doc<"recruitments">,
  totalStaffCount: number,
) {
  // 回答数は shiftSubmissions を正とする。
  // 全日休み提出では明細が0件になるため、提出記録を数えないと未提出扱いになってしまう。
  const stats = await ctx.db
    .query("recruitmentStats")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
    .first();
  const submissions = stats
    ? []
    : await ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(DASHBOARD_RESPONSE_COUNT_LIMIT);
  return {
    _id: recruitment._id,
    createdAt: recruitment._creationTime,
    periodStart: recruitment.periodStart,
    periodEnd: recruitment.periodEnd,
    deadline: recruitment.deadline,
    shopClosedDates: recruitment.shopClosedDates ?? [],
    status: recruitment.status,
    confirmedAt: recruitment.confirmedAt ?? null,
    // 提出数は対象外スタッフの提出も含みうるため、母数（対象外を除いた総数）を上限にクランプし、
    // 「3/2人」のような不可能な比率が表示されないようにする。
    responseCount: Math.min(stats?.submittedCount ?? submissions.length, totalStaffCount),
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

async function getDashboardRecruitmentCandidateDocs(
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

function toDashboardAnnouncement(announcement: Doc<"dashboardAnnouncements">) {
  return {
    _id: announcement._id,
    ...(announcement.organizationId !== undefined ? { organizationId: announcement.organizationId } : {}),
    ...(announcement.shopId !== undefined ? { shopId: announcement.shopId } : {}),
    ...(announcement.organizationPlan !== undefined
      ? { organizationPlan: normalizeDashboardAnnouncementPlanTargets(announcement.organizationPlan) }
      : {}),
    title: announcement.title,
    bodyHtml: announcement.bodyHtml,
    displayDate: announcement.displayDate,
  };
}

export const getDashboardShop = managerQuery({
  args: {},
  returns: v.union(dashboardShopValidator, v.null()),
  handler: async (ctx) => {
    const shop = ctx.shop;
    if (!shop) return null;
    const billingState = ctx.organization ? await getOrganizationBillingState(ctx, ctx.organization._id) : null;
    const billingPolicy = billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
    const trialEndingNotice =
      billingState?.state.kind === "trial" && billingState.state.selectedPaidPlan === undefined
        ? {
            visibleFrom: billingState.state.trialEndsAt - TRIAL_ENDING_REMINDER_LEAD_MS,
            trialEndsAt: billingState.state.trialEndsAt,
          }
        : null;

    return {
      name: shop.name,
      regularClosedDays: shop.regularClosedDays,
      submissionPattern: shop.submissionPattern,
      // 課金state未作成の移行中orgは、managerMutationの旧導線互換と同じく許可扱いにする。
      canWriteBusinessData: billingPolicy?.canWriteBusinessData ?? true,
      businessWriteBlockReason: billingPolicy?.businessWriteBlockReason ?? null,
      trialEndingNotice,
    };
  },
});

/**
 * ログインユーザーが所属する全店舗を返す。
 * 複数店舗マネージャーが操作対象店舗を選ぶための一覧（フロントの selectedShopAtom 初期化に使う）。
 */
export const getMyShops = authenticatedQuery({
  args: {},
  returns: v.array(myShopValidator),
  handler: async (ctx) => {
    if (!ctx.identity || !ctx.user || ctx.user.isDeleted) return [];
    const user = ctx.user;
    const result = new Map<
      Doc<"shops">["_id"],
      {
        shopId: Doc<"shops">["_id"];
        shopName: string;
        shopStatus: "active" | "archived" | "planSuspended";
        organizationId: Doc<"organizations">["_id"] | null;
        organizationName: string | null;
        organizationPlan: "trial" | "free" | "pro" | "business" | null;
        memberStatus: "active" | "readOnly" | "removed";
      }
    >();

    for (const status of ["active", "readOnly"] as const) {
      const organizationMemberships = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", status))
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
            shopStatus: shop.operatingStatus ?? "active",
            organizationId: organization._id,
            organizationName: organization.name,
            organizationPlan,
            memberStatus: membership.status,
          });
        }
      }
    }

    // TODO[narrow]: develop/prodでm009_shops_to_organizationsと
    //   m010_shop_members_to_organization_membersが完走していることを
    //   `pnpm convex:migrate:status`（state: done）で確認後、このlegacyMemberships fallbackを削除する。
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
          shopStatus: shop.operatingStatus ?? "active",
          organizationId: null,
          organizationName: null,
          organizationPlan: null,
          memberStatus: "active",
        });
        continue;
      }

      // m009完了後/m010完了前だけは、該当店舗一件に限って旧所属を読む。
      // organizationMembersが存在する場合はremoved/readOnlyを旧所属で上書きしない。
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
        shopStatus: shop.operatingStatus ?? "active",
        organizationId: organization._id,
        organizationName: organization.name,
        organizationPlan,
        memberStatus: "active",
      });
    }

    return [...result.values()].sort(
      (a, b) =>
        (a.organizationName ?? "").localeCompare(b.organizationName ?? "", "ja") ||
        a.shopName.localeCompare(b.shopName, "ja"),
    );
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
      .map(toDashboardAnnouncement);
  },
});

// 対象値は表示制御用であり、認可境界ではない。本文は全認証ユーザーへ返るため機密情報を登録しない。
export const getActiveDashboardAnnouncementsV2 = authenticatedQuery({
  args: {},
  returns: v.array(dashboardAnnouncementValidator),
  handler: async (ctx) => {
    if (!ctx.identity || ctx.user?.isDeleted) return [];

    const announcements = await getActiveDashboardAnnouncementCandidates(ctx.db);
    return announcements.map(toDashboardAnnouncement);
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

    const currentRecruitments = await getCurrentRecruitmentDocs(ctx, shop._id);
    const totalStaffCount = await getTotalStaffCount(ctx, shop._id);

    return await Promise.all(
      currentRecruitments.map(async (recruitment) => toDashboardRecruitment(ctx, recruitment, totalStaffCount)),
    );
  },
});

export const getDashboardStaffs = managerQuery({
  args: { paginationOpts: paginationOptsValidator },
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

    const paginatedResult = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      paginatedResult.page.map(async (s) => {
        const lineAccount = await getStaffLineAccount(ctx, s._id);
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

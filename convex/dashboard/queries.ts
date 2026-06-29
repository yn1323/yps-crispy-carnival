import type { GenericDatabaseReader } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Doc } from "../_generated/dataModel";
import { todayJST } from "../_lib/dateFormat";
import { authenticatedQuery } from "../_lib/functions";
import {
  DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT,
  DASHBOARD_RECRUITMENT_CANDIDATE_GROUP_LIMIT,
  DASHBOARD_RESPONSE_COUNT_LIMIT,
} from "../constants";
import { getStaffLineAccount } from "../line/service";

// shop未登録のsetup中に paginated query が走ってもエラーログを出さないための空結果
const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};

async function getManagerShop(ctx: {
  db: GenericDatabaseReader<DataModel>;
  identity: { subject: string } | null;
  user: Doc<"users"> | null;
}) {
  if (!ctx.identity || !ctx.user) return null;
  const user = ctx.user;
  const membership = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
    .first();
  if (!membership) return null;
  const shop = await ctx.db.get(membership.shopId);
  return shop && !shop.isDeleted ? shop : null;
}

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
    responseCount: stats?.submittedCount ?? submissions.length,
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
  const [currentRecruitments, actionRequiredRecruitments, collectingRecruitments, futureConfirmedRecruitments] =
    await Promise.all([
      getCurrentRecruitmentDocs(ctx, shopId),
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_status_and_deadline", (q) =>
          q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "open").lt("deadline", today),
        )
        .order("asc")
        .take(groupLimit),
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_status_and_deadline", (q) =>
          q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "open").gte("deadline", today),
        )
        .order("asc")
        .take(groupLimit),
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
          q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "confirmed").gt("periodStart", today),
        )
        .order("asc")
        .take(groupLimit),
    ]);

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

export const getDashboardShop = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const shop = await getManagerShop(ctx);
    if (!shop) return null;

    return {
      name: shop.name,
      regularClosedDays: shop.regularClosedDays,
      submissionPattern: shop.submissionPattern,
    };
  },
});

/**
 * ログインユーザーが所属する全店舗を返す。
 * 複数店舗マネージャーが操作対象店舗を選ぶための一覧（フロントの selectedShopAtom 初期化に使う）。
 */
export const getMyShops = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.identity || !ctx.user) return [];
    const user = ctx.user;
    const memberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
      .collect();
    const shops = await Promise.all(memberships.map((m) => ctx.db.get(m.shopId)));
    return shops
      .filter((shop): shop is Doc<"shops"> => shop !== null && !shop.isDeleted)
      .map((shop) => ({ shopId: shop._id, shopName: shop.name }));
  },
});

export const getActiveDashboardAnnouncement = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.identity) return null;

    const announcement = await ctx.db
      .query("dashboardAnnouncements")
      .withIndex("by_isPublished_and_isDeleted_and_displayDate", (q) =>
        q.eq("isPublished", true).eq("isDeleted", false),
      )
      .order("desc")
      .first();
    if (!announcement) return null;

    return {
      _id: announcement._id,
      title: announcement.title,
      bodyHtml: announcement.bodyHtml,
      displayDate: announcement.displayDate,
    };
  },
});

export const getDashboardRecruitments = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getManagerShop(ctx);
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

export const hasDashboardPastRecruitments = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getManagerShop(ctx);
    if (!shop) return false;

    const today = todayJST();
    const pastRecruitment = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
        q.eq("shopId", shop._id).eq("isDeleted", false).eq("status", "confirmed").lt("periodEnd", today),
      )
      .order("desc")
      .first();
    return pastRecruitment !== null;
  },
});

export const getDashboardPastRecruitments = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getManagerShop(ctx);
    if (!shop) return EMPTY_PAGE;

    const today = todayJST();
    const paginatedResult = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
        q.eq("shopId", shop._id).eq("isDeleted", false).eq("status", "confirmed").lt("periodEnd", today),
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

export const getDashboardCurrentRecruitments = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getManagerShop(ctx);
    if (!shop) return [];

    const currentRecruitments = await getCurrentRecruitmentDocs(ctx, shop._id);
    const totalStaffCount = await getTotalStaffCount(ctx, shop._id);

    return await Promise.all(
      currentRecruitments.map(async (recruitment) => toDashboardRecruitment(ctx, recruitment, totalStaffCount)),
    );
  },
});

export const getDashboardStaffs = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getManagerShop(ctx);
    if (!shop) return EMPTY_PAGE;

    const paginatedResult = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      paginatedResult.page.map(async (s) => {
        const lineAccount = await getStaffLineAccount(ctx, s._id);
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          isManager: s.userId === ctx.user?._id,
          isLineLinked: Boolean(lineAccount?.lineUserId),
          isLineFollowing: Boolean(lineAccount?.following),
          excludedFromShift: s.excludedFromShift ?? false,
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
  handler: async (ctx) => {
    const { identity, user } = ctx;
    if (!identity) return null;
    if (!user || user.isDeleted) {
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

import type { GenericDatabaseReader } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Doc } from "../_generated/dataModel";
import { authenticatedQuery } from "../_lib/functions";
import { getSubmissionPattern } from "../_lib/submissionPattern";
import { DASHBOARD_RESPONSE_COUNT_LIMIT } from "../constants";
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

export const getDashboardShop = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const shop = await getManagerShop(ctx);
    if (!shop) return null;

    return {
      name: shop.name,
      regularClosedDays: shop.regularClosedDays,
      submissionPattern: getSubmissionPattern(shop.submissionPattern, {
        startTime: shop.shiftStartTime,
        endTime: shop.shiftEndTime,
      }),
    };
  },
});

export const getDashboardRecruitments = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getManagerShop(ctx);
    if (!shop) return EMPTY_PAGE;

    const paginatedResult = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .order("desc")
      .paginate(args.paginationOpts);
    const activeStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .collect();
    const totalStaffCount = activeStaffs.length;

    const page = await Promise.all(
      paginatedResult.page.map(async (r) => {
        // 回答数は shiftSubmissions を正とする。
        // 全日休み提出では明細が0件になるため、提出記録を数えないと未提出扱いになってしまう。
        const stats = await ctx.db
          .query("recruitmentStats")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", r._id))
          .first();
        const submissions = stats
          ? []
          : await ctx.db
              .query("shiftSubmissions")
              .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", r._id))
              .take(DASHBOARD_RESPONSE_COUNT_LIMIT);
        return {
          _id: r._id,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          deadline: r.deadline,
          shopClosedDates: r.shopClosedDates ?? [],
          status: r.status,
          responseCount: stats?.submittedCount ?? submissions.length,
          totalStaffCount,
        };
      }),
    );

    return {
      ...paginatedResult,
      page,
    };
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

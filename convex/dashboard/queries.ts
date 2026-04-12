import type { GenericDatabaseReader } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "../_generated/dataModel";
import { authenticatedQuery } from "../_lib/functions";

const MAX_SHIFT_REQUESTS = 1000;

// shop未登録のsetup中に paginated query が走ってもエラーログを出さないための空結果
const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" } as {
  page: never[];
  isDone: boolean;
  continueCursor: string;
};

async function getOwnerShop(ctx: { db: GenericDatabaseReader<DataModel>; identity: { subject: string } | null }) {
  if (!ctx.identity) return null;
  const subject = ctx.identity.subject;
  const shop = await ctx.db
    .query("shops")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", subject))
    .first();
  return shop && !shop.isDeleted ? shop : null;
}

export const getDashboardShop = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const shop = await getOwnerShop(ctx);
    if (!shop) return null;

    return {
      name: shop.name,
      shiftStartTime: shop.shiftStartTime,
      shiftEndTime: shop.shiftEndTime,
    };
  },
});

export const getDashboardRecruitments = authenticatedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (!ctx.identity) throw new ConvexError("Unauthenticated");
    const shop = await getOwnerShop(ctx);
    if (!shop) return EMPTY_PAGE;

    const paginatedResult = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      paginatedResult.page.map(async (r) => {
        const requests = await ctx.db
          .query("shiftRequests")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", r._id))
          .take(MAX_SHIFT_REQUESTS);
        const uniqueStaffIds = new Set(requests.map((req) => req.staffId));
        return {
          _id: r._id,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          deadline: r.deadline,
          status: r.status,
          responseCount: uniqueStaffIds.size,
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
    const shop = await getOwnerShop(ctx);
    if (!shop) return EMPTY_PAGE;

    const paginatedResult = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .paginate(args.paginationOpts);

    const page = paginatedResult.page.map((s) => ({
      _id: s._id,
      name: s.name,
      email: s.email,
      isOwner: s.userId === ctx.user?._id,
    }));

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
    };
  },
});

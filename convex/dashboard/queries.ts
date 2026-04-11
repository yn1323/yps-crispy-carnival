import { authenticatedQuery } from "../_lib/functions";

const MAX_RECRUITMENTS = 50;
const MAX_STAFFS = 200;
const MAX_SHIFT_REQUESTS = 1000;

export const getDashboardData = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { identity } = ctx;
    if (!identity) return null;

    const shop = await ctx.db
      .query("shops")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject))
      .first();

    if (!shop || shop.isDeleted) {
      return { shop: null, recruitments: [], staffs: [] };
    }

    const [allRecruitments, allStaffs] = await Promise.all([
      ctx.db
        .query("recruitments")
        .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
        .order("desc")
        .take(MAX_RECRUITMENTS),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
        .take(MAX_STAFFS),
    ]);
    const recruitments = allRecruitments.filter((r) => !r.isDeleted);
    const staffs = allStaffs.filter((s) => !s.isDeleted);
    const totalStaffCount = staffs.length;

    const recruitmentsWithCounts = await Promise.all(
      recruitments.map(async (r) => {
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
          totalStaffCount,
        };
      }),
    );

    return {
      shop: {
        name: shop.name,
        shiftStartTime: shop.shiftStartTime,
        shiftEndTime: shop.shiftEndTime,
      },
      recruitments: recruitmentsWithCounts,
      staffs: staffs.map((s) => ({ _id: s._id, name: s.name, email: s.email, isOwner: s.userId === ctx.user?._id })),
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

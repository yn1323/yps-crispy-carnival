import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { SHIFT_BOARD_STAFF_LIMIT, STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT } from "../constants";
import { getStaffLineAccount } from "../line/service";

export const listPendingRequestShopIdsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((request) => request.shopId),
    };
  },
});

export const getOwnerDigestTargetForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return null;

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
      .first();
    if (!pendingRequest) return null;

    const [members, activeStaffs] = await Promise.all([
      ctx.db
        .query("shopMembers")
        .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .take(STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
    ]);

    const staffByUserId = new Map<Id<"users">, (typeof activeStaffs)[number]>();
    for (const staff of activeStaffs) {
      if (staff.userId) staffByUserId.set(staff.userId, staff);
    }

    const recipients = (
      await Promise.all(
        members.map(async (member) => {
          const user = await ctx.db.get(member.userId);
          if (!user || user.isDeleted || !user.email) return null;

          const managerStaff = staffByUserId.get(user._id);
          const lineAccount = managerStaff ? await getStaffLineAccount(ctx, managerStaff._id) : null;

          return {
            userId: user._id,
            name: user.name,
            email: user.email,
            lineUserId: lineAccount?.lineUserId,
            lineFollowing: lineAccount?.following,
          };
        }),
      )
    ).filter((recipient) => recipient !== null);

    if (recipients.length === 0) return null;

    return {
      shopId,
      shopName: shop.name,
      dashboardUrl: `${APP_URL}/dashboard`,
      recipients,
    };
  },
});

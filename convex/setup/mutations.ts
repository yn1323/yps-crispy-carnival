import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedMutation } from "../_lib/functions";
import { recordUserLegalConsent } from "../legal/service";
import { ensureDefaultPosition } from "../position/service";

export const setupShopAndManager = authenticatedMutation({
  args: {
    shopName: v.string(),
    shiftStartTime: v.string(),
    shiftEndTime: v.string(),
    managerName: v.string(),
    managerEmail: v.string(),
    acceptedLegal: v.literal(true),
  },
  handler: async (ctx, args) => {
    const currentUser = ctx.user;
    const existingMembership = currentUser
      ? await ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", currentUser._id).eq("isDeleted", false))
          .first()
      : null;
    const existingShop = existingMembership ? await ctx.db.get(existingMembership.shopId) : null;
    if (existingShop && !existingShop.isDeleted) {
      throw new ConvexError("既に店舗が登録されています");
    }

    const shopId = await ctx.db.insert("shops", {
      name: args.shopName,
      shiftStartTime: args.shiftStartTime,
      shiftEndTime: args.shiftEndTime,
      regularClosedDays: [],
      isDeleted: false,
    });

    const userId = currentUser
      ? currentUser._id
      : await ctx.db.insert("users", {
          authTokenIdentifier: ctx.identity.tokenIdentifier,
          name: args.managerName,
          email: args.managerEmail,
          emailNormalized: args.managerEmail.trim().toLowerCase(),
          role: "manager",
          isDeleted: false,
        });
    await ctx.db.insert("shopMembers", {
      shopId,
      userId,
      role: "manager",
      isDeleted: false,
    });
    await ensureDefaultPosition(ctx, shopId);

    if (currentUser) {
      await ctx.db.patch(currentUser._id, {
        name: args.managerName,
        email: args.managerEmail,
        emailNormalized: args.managerEmail.trim().toLowerCase(),
      });
    }

    await recordUserLegalConsent(ctx, {
      userId,
      shopId,
      method: "manager_setup",
    });

    // manager もスタッフ一覧に含める。自分のシフトやLINE通知を同じ画面で扱うため、
    // users と staffs は userId で紐付け、後続の編集時に表示名を同期する。
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: args.managerName,
      email: args.managerEmail,
      emailNormalized: args.managerEmail.trim().toLowerCase(),
      userId,
      isDeleted: false,
    });

    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId,
    });

    return shopId;
  },
});

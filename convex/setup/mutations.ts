import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../_lib/functions";

export const setupShopAndOwner = authenticatedMutation({
  args: {
    shopName: v.string(),
    shiftStartTime: v.string(),
    shiftEndTime: v.string(),
    ownerName: v.string(),
    ownerEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const existingShop = await ctx.db
      .query("shops")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ctx.identity.subject))
      .first();
    if (existingShop && !existingShop.isDeleted) {
      throw new ConvexError("既に店舗が登録されています");
    }

    const shopId = await ctx.db.insert("shops", {
      name: args.shopName,
      shiftStartTime: args.shiftStartTime,
      shiftEndTime: args.shiftEndTime,
      ownerId: ctx.identity.subject,
      isDeleted: false,
    });

    const userId = ctx.user
      ? ctx.user._id
      : await ctx.db.insert("users", {
          clerkId: ctx.identity.subject,
          name: args.ownerName,
          email: args.ownerEmail,
          role: "manager",
          isDeleted: false,
        });

    if (ctx.user) {
      await ctx.db.patch(ctx.user._id, {
        name: args.ownerName,
        email: args.ownerEmail,
      });
    }

    await ctx.db.insert("staffs", {
      shopId,
      name: args.ownerName,
      email: args.ownerEmail,
      userId,
      isDeleted: false,
    });

    return shopId;
  },
});

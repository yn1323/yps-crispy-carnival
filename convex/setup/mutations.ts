import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../_lib/functions";

export const createShop = authenticatedMutation({
  args: {
    shopName: v.string(),
    shiftStartTime: v.string(),
    shiftEndTime: v.string(),
  },
  handler: async (ctx, args) => {
    const existingShop = await ctx.db
      .query("shops")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ctx.identity.subject))
      .first();
    if (existingShop && !existingShop.isDeleted) {
      throw new ConvexError("既に店舗が登録されています");
    }

    if (!ctx.user) {
      await ctx.db.insert("users", {
        clerkId: ctx.identity.subject,
        name: ctx.identity.name ?? "",
        email: ctx.identity.email ?? "",
        role: "manager",
        isDeleted: false,
      });
    }

    const shopId = await ctx.db.insert("shops", {
      name: args.shopName,
      shiftStartTime: args.shiftStartTime,
      shiftEndTime: args.shiftEndTime,
      ownerId: ctx.identity.subject,
      isDeleted: false,
    });

    return shopId;
  },
});

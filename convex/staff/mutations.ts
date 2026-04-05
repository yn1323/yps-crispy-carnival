import { ConvexError, v } from "convex/values";
import { managerMutation } from "../_lib/functions";

export const addStaffs = managerMutation({
  args: {
    entries: v.array(v.object({ name: v.string(), email: v.string() })),
  },
  handler: async (ctx, args) => {
    const validEntries = args.entries.filter((e) => e.name.trim() !== "");

    const existingStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId", (q) => q.eq("shopId", ctx.shop._id))
      .take(500);
    const existingEmails = new Set(existingStaffs.filter((s) => !s.isDeleted && s.email).map((s) => s.email));

    const inserted = [];
    for (const entry of validEntries) {
      if (entry.email && existingEmails.has(entry.email)) continue;
      const id = await ctx.db.insert("staffs", {
        shopId: ctx.shop._id,
        name: entry.name,
        email: entry.email,
        isDeleted: false,
      });
      inserted.push(id);
    }
    return inserted;
  },
});

export const editStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
      throw new ConvexError("Not found");
    }

    const trimmedEmail = args.email.trim();
    if (trimmedEmail !== "") {
      const duplicate = await ctx.db
        .query("staffs")
        .withIndex("by_email", (q) => q.eq("email", trimmedEmail))
        .first();
      if (duplicate && duplicate._id !== args.staffId && !duplicate.isDeleted && duplicate.shopId === ctx.shop._id) {
        throw new ConvexError("このメールアドレスは既に使用されています");
      }
    }

    await ctx.db.patch(args.staffId, {
      name: args.name.trim(),
      email: trimmedEmail,
    });
  },
});

export const deleteStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
      throw new ConvexError("Not found");
    }

    if (staff.userId === ctx.user._id) {
      throw new ConvexError("管理者自身は削除できません");
    }

    await ctx.db.patch(args.staffId, { isDeleted: true });
  },
});

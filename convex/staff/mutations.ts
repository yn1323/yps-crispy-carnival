import { v } from "convex/values";
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

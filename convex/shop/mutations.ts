import { ConvexError, v } from "convex/values";
import { managerMutation } from "../_lib/functions";
import { timeToMinutes } from "../_lib/time";

export const updateShopSettings = managerMutation({
  args: {
    shopName: v.string(),
    shiftStartTime: v.string(),
    shiftEndTime: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.shopName.trim();
    if (name.length === 0) {
      throw new ConvexError("店舗名を入力してください");
    }
    if (timeToMinutes(args.shiftEndTime) <= timeToMinutes(args.shiftStartTime)) {
      throw new ConvexError("終了時間は開始時間より後にしてください");
    }
    await ctx.db.patch(ctx.shop._id, {
      name,
      shiftStartTime: args.shiftStartTime,
      shiftEndTime: args.shiftEndTime,
    });
  },
});

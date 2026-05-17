import { DEFAULT_SUBMISSION_PATTERN } from "../_lib/submissionPattern";
import { migrations } from "./index";

export const migration = migrations.define({
  table: "recruitments",
  migrateOne: async (ctx, doc) => {
    if (doc.submissionPattern !== undefined) return;
    if (doc.shiftStartTime !== undefined && doc.shiftEndTime !== undefined) {
      return {
        submissionPattern: { kind: "time" as const, startTime: doc.shiftStartTime, endTime: doc.shiftEndTime },
      };
    }

    const shop = await ctx.db.get(doc.shopId);
    if (shop?.submissionPattern !== undefined) {
      return { submissionPattern: shop.submissionPattern };
    }
    if (shop?.shiftStartTime !== undefined && shop.shiftEndTime !== undefined) {
      return {
        submissionPattern: { kind: "time" as const, startTime: shop.shiftStartTime, endTime: shop.shiftEndTime },
      };
    }

    return { submissionPattern: DEFAULT_SUBMISSION_PATTERN };
  },
});

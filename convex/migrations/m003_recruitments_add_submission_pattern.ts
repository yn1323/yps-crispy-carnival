import { DEFAULT_SUBMISSION_PATTERN } from "../_lib/submissionPattern";
import { migrations } from "./index";

// shiftStartTime/shiftEndTime は m007/m008 完走後に schema から削除済み。
// 本マイグレーションは実行完了済みの履歴で、削除済みフィールドは型ビュー経由で読む。
type LegacyShiftTimes = { shiftStartTime?: string; shiftEndTime?: string };

export const migration = migrations.define({
  table: "recruitments",
  migrateOne: async (ctx, doc) => {
    if (doc.submissionPattern !== undefined) return;
    const docLegacy = doc as typeof doc & LegacyShiftTimes;
    if (docLegacy.shiftStartTime !== undefined && docLegacy.shiftEndTime !== undefined) {
      return {
        submissionPattern: {
          kind: "time" as const,
          startTime: docLegacy.shiftStartTime,
          endTime: docLegacy.shiftEndTime,
        },
      };
    }

    const shop = await ctx.db.get(doc.shopId);
    if (shop?.submissionPattern !== undefined) {
      return { submissionPattern: shop.submissionPattern };
    }
    const shopLegacy = shop as (typeof shop & LegacyShiftTimes) | null;
    if (shopLegacy?.shiftStartTime !== undefined && shopLegacy.shiftEndTime !== undefined) {
      return {
        submissionPattern: {
          kind: "time" as const,
          startTime: shopLegacy.shiftStartTime,
          endTime: shopLegacy.shiftEndTime,
        },
      };
    }

    return { submissionPattern: DEFAULT_SUBMISSION_PATTERN };
  },
});

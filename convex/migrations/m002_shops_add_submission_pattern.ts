import { DEFAULT_SUBMISSION_PATTERN } from "../_lib/submissionPattern";
import { migrations } from "./index";

// shiftStartTime/shiftEndTime は m007 完走後に schema から削除済み。
// 本マイグレーションは実行完了済みの履歴で、削除済みフィールドは型ビュー経由で読む。
type LegacyShiftTimes = { shiftStartTime?: string; shiftEndTime?: string };

export const migration = migrations.define({
  table: "shops",
  migrateOne: async (_ctx, doc) => {
    if (doc.submissionPattern !== undefined) return;
    const { shiftStartTime, shiftEndTime } = doc as typeof doc & LegacyShiftTimes;
    if (shiftStartTime !== undefined && shiftEndTime !== undefined) {
      return {
        submissionPattern: { kind: "time" as const, startTime: shiftStartTime, endTime: shiftEndTime },
      };
    }
    return { submissionPattern: DEFAULT_SUBMISSION_PATTERN };
  },
});

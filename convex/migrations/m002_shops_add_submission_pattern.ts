import { DEFAULT_SUBMISSION_PATTERN } from "../_lib/submissionPattern";
import { migrations } from "./index";

export const migration = migrations.define({
  table: "shops",
  migrateOne: async (_ctx, doc) => {
    if (doc.submissionPattern !== undefined) return;
    if (doc.shiftStartTime !== undefined && doc.shiftEndTime !== undefined) {
      return {
        submissionPattern: { kind: "time" as const, startTime: doc.shiftStartTime, endTime: doc.shiftEndTime },
      };
    }
    return { submissionPattern: DEFAULT_SUBMISSION_PATTERN };
  },
});

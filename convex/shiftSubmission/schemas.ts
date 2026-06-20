import { z } from "zod";
import { isoDateStringSchema, supportedShiftTimeSchema } from "../_lib/validation";
import { SHIFT_REQUESTS_PER_SUBMISSION_LIMIT } from "../constants";

const shiftRequestDateSchema = isoDateStringSchema("日付を入力してください", "日付の形式が正しくありません");
const shiftRequestStartTimeSchema = supportedShiftTimeSchema(
  "開始時間を入力してください",
  "開始時間が正しくありません",
);
const shiftRequestEndTimeSchema = supportedShiftTimeSchema("終了時間を入力してください", "終了時間が正しくありません");

export const shiftRequestSchema = z.object({
  date: shiftRequestDateSchema,
  startTime: shiftRequestStartTimeSchema,
  endTime: shiftRequestEndTimeSchema,
});

export const submitShiftRequestsSchema = z.object({
  requests: z.array(shiftRequestSchema).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
});

export const submitShiftSelectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("time"),
    requests: z.array(shiftRequestSchema).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
  z.object({
    kind: z.literal("dateOnly"),
    workingDates: z.array(shiftRequestDateSchema).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
  z.object({
    kind: z.literal("shiftType"),
    selections: z
      .array(
        z.object({
          date: shiftRequestDateSchema,
          optionId: z.string().min(1),
        }),
      )
      .max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
]);

export type SubmitShiftSelection = z.infer<typeof submitShiftSelectionSchema>;

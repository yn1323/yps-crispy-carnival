import { z } from "zod";
import { SHIFT_REQUESTS_PER_SUBMISSION_LIMIT } from "../constants";

export const shiftRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
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
    workingDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
  z.object({
    kind: z.literal("shiftType"),
    selections: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          optionId: z.string().min(1),
        }),
      )
      .max(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
  }),
]);

export type SubmitShiftSelection = z.infer<typeof submitShiftSelectionSchema>;

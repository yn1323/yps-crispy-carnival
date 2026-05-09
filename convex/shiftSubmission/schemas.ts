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

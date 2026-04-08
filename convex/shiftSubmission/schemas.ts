import { z } from "zod";

export const shiftRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
});

export const submitShiftRequestsSchema = z.object({
  requests: z.array(shiftRequestSchema).max(31),
});

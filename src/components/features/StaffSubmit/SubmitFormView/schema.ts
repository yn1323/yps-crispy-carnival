import { z } from "zod";
import { timeToMinutes } from "@/src/components/features/Shift/ShiftForm/utils/timeConversion";

const dayEntrySchema = z.object({
  date: z.string(),
  isWorking: z.boolean(),
  startTime: z.string(),
  endTime: z.string(),
});

const workingDaySchema = dayEntrySchema.refine(
  (entry) => !entry.isWorking || timeToMinutes(entry.endTime) > timeToMinutes(entry.startTime),
  { message: "終了時間は開始時間より後にしてください", path: ["endTime"] },
);

export const submitFormSchema = z.object({
  entries: z.array(workingDaySchema),
});

export type SubmitFormData = z.infer<typeof submitFormSchema>;

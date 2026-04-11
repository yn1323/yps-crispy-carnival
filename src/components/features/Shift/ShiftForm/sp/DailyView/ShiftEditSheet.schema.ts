import { z } from "zod";
import { timeToMinutes } from "../../utils/timeConversion";

export const addTimeSchema = z
  .object({
    startTime: z.string().min(1, "開始時間を選択してください"),
    endTime: z.string().min(1, "終了時間を選択してください"),
  })
  .refine((data) => !data.startTime || !data.endTime || timeToMinutes(data.endTime) > timeToMinutes(data.startTime), {
    message: "終了時間は開始時間より後にしてください",
    path: ["endTime"],
  });

export type AddTimeFormData = z.infer<typeof addTimeSchema>;

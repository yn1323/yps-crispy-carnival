import { z } from "zod";
import { timeToMinutes } from "../_lib/time";

export const regularClosedDaySchema = z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
export const regularClosedDaysSchema = z.array(regularClosedDaySchema);

export const updateShopSettingsSchema = z
  .object({
    shopName: z.string().min(1),
    shiftStartTime: z.string().min(1),
    shiftEndTime: z.string().min(1),
    regularClosedDays: regularClosedDaysSchema,
  })
  .refine((data) => timeToMinutes(data.shiftEndTime) > timeToMinutes(data.shiftStartTime), {
    message: "終了時間は開始時間より後にしてください",
    path: ["shiftEndTime"],
  });

export type RegularClosedDay = z.infer<typeof regularClosedDaySchema>;
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;

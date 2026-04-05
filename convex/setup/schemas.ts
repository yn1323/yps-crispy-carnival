import { z } from "zod";
import { timeToMinutes } from "../_lib/time";

export const createShopSchema = z
  .object({
    shopName: z.string().min(1),
    shiftStartTime: z.string().min(1),
    shiftEndTime: z.string().min(1),
  })
  .refine((data) => timeToMinutes(data.shiftEndTime) > timeToMinutes(data.shiftStartTime), {
    message: "終了時間は開始時間より後にしてください",
    path: ["shiftEndTime"],
  });

export type CreateShopInput = z.infer<typeof createShopSchema>;

export const ownerProfileSchema = z.object({
  name: z.string().min(1, "名前を入力してください"),
  email: z.string().min(1, "メールアドレスを入力してください").email("正しいメールアドレスを入力してください"),
});

export type OwnerProfileInput = z.infer<typeof ownerProfileSchema>;

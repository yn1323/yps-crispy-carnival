import { z } from "zod";
import { optionalEmail } from "../_lib/validation";

export const staffEntrySchema = z
  .object({
    name: z.string(),
    email: z.string().superRefine(optionalEmail),
  })
  .refine((entry) => entry.name.trim() !== "" || entry.email.trim() === "", {
    message: "名前を入力してください",
    path: ["name"],
  })
  .refine((entry) => entry.email.trim() !== "" || entry.name.trim() === "", {
    message: "メールアドレスを入力してください",
    path: ["email"],
  });

export type StaffEntryInput = z.infer<typeof staffEntrySchema>;

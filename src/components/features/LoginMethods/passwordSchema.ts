import { z } from "zod";

export const passwordSetupSchema = z
  .object({
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください。"),
    confirmation: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ["confirmation"],
    message: "確認用パスワードが一致しません。",
  });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "現在のパスワードを入力してください。"),
    newPassword: z.string().min(8, "新しいパスワードは8文字以上で入力してください。"),
    confirmation: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ["confirmation"],
    message: "確認用パスワードが一致しません。",
  });

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;
export type PasswordSetupValues = z.infer<typeof passwordSetupSchema>;

import { z } from "zod";

export const forgotRequestSchema = z.object({
  email: z.string().min(1, "メールアドレスを入力してください").email("メールアドレスの形式で入力してください"),
});

export const forgotResetSchema = z.object({
  code: z.string().min(1, "確認コードを入力してください"),
  password: z.string().min(8, "新しいパスワードは8文字以上で入力してください"),
});

export type ForgotRequestValues = z.infer<typeof forgotRequestSchema>;
export type ForgotResetValues = z.infer<typeof forgotResetSchema>;

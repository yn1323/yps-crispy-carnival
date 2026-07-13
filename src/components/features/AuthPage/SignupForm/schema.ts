import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().min(1, "メールアドレスを入力してください").email("メールアドレスの形式で入力してください"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
});

export type SignupValues = z.infer<typeof signupSchema>;

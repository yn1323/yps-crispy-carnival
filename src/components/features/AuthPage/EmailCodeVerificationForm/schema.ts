import { z } from "zod";

export const emailVerificationSchema = z.object({
  code: z.string().min(1, "確認コードを入力してください"),
});

export type EmailVerificationValues = z.infer<typeof emailVerificationSchema>;

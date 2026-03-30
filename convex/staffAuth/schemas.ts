import { z } from "zod";

export const reissueSchema = z.object({
  email: z.email("正しいメールアドレスを入力してください"),
});

export type ReissueFormValues = z.infer<typeof reissueSchema>;

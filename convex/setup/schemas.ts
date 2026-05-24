import { z } from "zod";
import { addShiftSubmissionPatternIssues, shiftSubmissionPatternSchema } from "../shop/schemas";

export const createShopSchema = z
  .object({
    shopName: z.string().min(1),
    submissionPattern: shiftSubmissionPatternSchema,
  })
  .superRefine((data, ctx) => {
    addShiftSubmissionPatternIssues(data.submissionPattern, ctx);
  });

export type CreateShopInput = z.infer<typeof createShopSchema>;

export const managerProfileSchema = z.object({
  name: z.string().min(1, "名前を入力してください"),
  email: z.string().min(1, "メールアドレスを入力してください").email("正しいメールアドレスを入力してください"),
  acceptedLegal: z.boolean().refine((value) => value, {
    message: "利用規約とプライバシーポリシーに同意してください",
  }),
});

export type ManagerProfileInput = z.infer<typeof managerProfileSchema>;

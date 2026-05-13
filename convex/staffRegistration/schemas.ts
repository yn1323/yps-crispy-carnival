import { z } from "zod";

const requiredEmail = z.string().trim().email("正しいメールアドレスを入力してください");

export const staffRegistrationFormSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください").max(80, "名前は80文字以内で入力してください"),
  email: requiredEmail.max(254, "メールアドレスは254文字以内で入力してください"),
  acceptedLegal: z.boolean().refine((value) => value === true, {
    message: "利用規約とプライバシーポリシーに同意してください",
  }),
});

export type StaffRegistrationFormData = z.infer<typeof staffRegistrationFormSchema>;

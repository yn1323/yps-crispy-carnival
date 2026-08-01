import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import { PERSON_NAME_MAX_LENGTH, STAFF_REGISTRATION_TURNSTILE_TOKEN_MAX_LENGTH } from "../constants";

export const staffRegistrationFormSchema = z.object({
  name: requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH }),
  email: requiredEmailSchema,
  acceptedLegal: z.boolean().refine((value) => value === true, {
    message: "利用規約とプライバシーポリシーに同意してください",
  }),
});

export const submitStaffRegistrationSchema = staffRegistrationFormSchema
  .extend({
    token: z.string().trim().uuid("登録リンクが正しくありません"),
    requestId: z.string().max(64, "送信情報が正しくありません").uuid("送信情報が正しくありません"),
    turnstileToken: z
      .string()
      .min(1, "セキュリティ確認を完了してください")
      .max(STAFF_REGISTRATION_TURNSTILE_TOKEN_MAX_LENGTH, "セキュリティ確認が正しくありません"),
  })
  .strict();

export type StaffRegistrationFormData = z.infer<typeof staffRegistrationFormSchema>;
export type SubmitStaffRegistrationInput = z.infer<typeof submitStaffRegistrationSchema>;

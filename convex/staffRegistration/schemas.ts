import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import {
  PERSON_NAME_MAX_LENGTH,
  STAFF_REGISTRATION_TURNSTILE_TOKEN_MAX_LENGTH,
  STAFF_REGISTRATION_VERIFICATION_CODE_INPUT_MAX_LENGTH,
  STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH,
} from "../constants";

export const staffRegistrationFormSchema = z.object({
  name: requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH }),
  email: requiredEmailSchema,
  acceptedLegal: z.boolean().refine((value) => value === true, {
    message: "利用規約とプライバシーポリシーに同意してください。",
  }),
});

const registrationTokenSchema = z.string().trim().uuid("登録リンクが正しくありません");
const verificationTokenSchema = z.string().uuid("送信情報が正しくありません");

export const submitStaffRegistrationSchema = staffRegistrationFormSchema
  .extend({
    token: registrationTokenSchema,
    requestId: z.string().max(64, "送信情報が正しくありません").uuid("送信情報が正しくありません"),
    turnstileToken: z
      .string()
      .min(1, "セキュリティ確認を完了してください")
      .max(STAFF_REGISTRATION_TURNSTILE_TOKEN_MAX_LENGTH, "セキュリティ確認が正しくありません"),
  })
  .strict();

const VERIFICATION_CODE_FORMAT_MESSAGE = `${STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH}桁の数字を入力してください`;
const VERIFICATION_CODE_PATTERN = new RegExp(`^\\d{${STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH}}$`);
// 空白と、メールから貼り付けたときに混ざるハイフン類（長音記号を含む）。
const VERIFICATION_CODE_SEPARATOR_PATTERN = /[\s-‐-―−ー]/g;

/** 全角と半角の混在、空白やハイフン入りの貼り付けを、半角数字だけの並びへそろえる。 */
export function normalizeVerificationCode(value: string): string {
  return value.normalize("NFKC").replace(VERIFICATION_CODE_SEPARATOR_PATTERN, "");
}

export const verificationCodeSchema = z
  .string()
  .max(STAFF_REGISTRATION_VERIFICATION_CODE_INPUT_MAX_LENGTH, VERIFICATION_CODE_FORMAT_MESSAGE)
  .transform(normalizeVerificationCode)
  .pipe(
    z
      .string()
      .min(1, "確認コードを入力してください")
      .regex(VERIFICATION_CODE_PATTERN, VERIFICATION_CODE_FORMAT_MESSAGE),
  );

export const staffRegistrationCodeFormSchema = z.object({ code: verificationCodeSchema });

export const confirmStaffRegistrationCodeSchema = z
  .object({
    token: registrationTokenSchema,
    verificationToken: verificationTokenSchema,
    code: verificationCodeSchema,
  })
  .strict();

export const resendStaffRegistrationCodeSchema = z
  .object({
    token: registrationTokenSchema,
    verificationToken: verificationTokenSchema,
  })
  .strict();

export type StaffRegistrationFormData = z.infer<typeof staffRegistrationFormSchema>;
export type SubmitStaffRegistrationInput = z.infer<typeof submitStaffRegistrationSchema>;
export type StaffRegistrationCodeFormInput = z.input<typeof staffRegistrationCodeFormSchema>;
export type StaffRegistrationCodeFormData = z.output<typeof staffRegistrationCodeFormSchema>;
export type ConfirmStaffRegistrationCodeInput = z.input<typeof confirmStaffRegistrationCodeSchema>;
export type ResendStaffRegistrationCodeInput = z.infer<typeof resendStaffRegistrationCodeSchema>;

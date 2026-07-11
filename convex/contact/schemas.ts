import { z } from "zod";
import { hasControlCharacter, requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_ORGANIZATION_MAX_LENGTH,
  CONTACT_TURNSTILE_TOKEN_MAX_LENGTH,
} from "../constants";

export const CONTACT_TYPE_OPTIONS = [
  { value: "introduction", label: "利用開始について" },
  { value: "usage", label: "機能や使い方" },
  { value: "trouble", label: "不具合・トラブル" },
  { value: "other", label: "その他" },
] as const;

export const contactTypeSchema = z.enum(CONTACT_TYPE_OPTIONS.map((option) => option.value));

const optionalOrganizationSchema = z
  .string()
  .trim()
  .max(CONTACT_ORGANIZATION_MAX_LENGTH, `店舗名は${CONTACT_ORGANIZATION_MAX_LENGTH}文字以内で入力してください`)
  .refine((value) => !hasControlCharacter(value), {
    message: "店舗名に使用できない文字が含まれています",
  });

function hasUnsupportedContactControlCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
  });
}

const contactMessageSchema = z
  .string()
  .trim()
  .min(1, "問い合わせ内容を入力してください")
  .max(CONTACT_MESSAGE_MAX_LENGTH, `問い合わせ内容は${CONTACT_MESSAGE_MAX_LENGTH}文字以内で入力してください`)
  .refine((value) => !hasUnsupportedContactControlCharacter(value), {
    message: "問い合わせ内容に使用できない文字が含まれています",
  });

export const contactFormSchema = z.object({
  type: contactTypeSchema,
  name: requiredDisplayTextSchema({ label: "氏名", maxLength: CONTACT_NAME_MAX_LENGTH }),
  email: requiredEmailSchema,
  organization: optionalOrganizationSchema,
  message: contactMessageSchema,
  acceptedPrivacy: z.boolean().refine((value) => value, {
    message: "プライバシーポリシーに同意してください",
  }),
});

export const submitContactSchema = contactFormSchema.extend({
  requestId: z.string().max(64, "送信情報が正しくありません").uuid("送信情報が正しくありません"),
  turnstileToken: z
    .string()
    .min(1, "セキュリティ確認を完了してください")
    .max(CONTACT_TURNSTILE_TOKEN_MAX_LENGTH, "セキュリティ確認が正しくありません"),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;
export type SubmitContactInput = z.infer<typeof submitContactSchema>;
export type ContactDeliveryInput = Omit<SubmitContactInput, "acceptedPrivacy" | "turnstileToken">;

export function getContactTypeLabel(type: SubmitContactInput["type"]): string {
  return CONTACT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "その他";
}

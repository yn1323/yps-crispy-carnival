import { describe, expect, it } from "vitest";
import { CONTACT_MESSAGE_MAX_LENGTH } from "../constants";
import { CONTACT_TYPE_OPTIONS, contactFormSchema, submitContactSchema } from "./schemas";

const validForm = {
  type: "introduction" as const,
  name: "田中 太郎",
  email: "tanaka@example.com",
  organization: "居酒屋たなか",
  message: "導入について相談したいです。",
  acceptedPrivacy: true,
};

describe("contact/schemas", () => {
  it("現在の問い合わせ種別だけを受け付ける", () => {
    expect(CONTACT_TYPE_OPTIONS).toEqual([
      { value: "introduction", label: "利用開始について" },
      { value: "usage", label: "機能や使い方" },
      { value: "trouble", label: "不具合・トラブル" },
      { value: "other", label: "その他" },
    ]);
    expect(contactFormSchema.safeParse({ ...validForm, type: "trouble" }).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...validForm, type: "contract" }).success).toBe(false);
  });

  it("問い合わせ入力をtrimして受け付ける", () => {
    expect(
      contactFormSchema.parse({
        ...validForm,
        name: "  田中 太郎  ",
        email: "  tanaka@example.com  ",
        message: "  導入について相談したいです。  ",
      }),
    ).toMatchObject({
      name: "田中 太郎",
      email: "tanaka@example.com",
      message: "導入について相談したいです。",
    });
  });

  it("必須項目とプライバシー同意を検証する", () => {
    const result = contactFormSchema.safeParse({
      ...validForm,
      name: "",
      email: "invalid",
      message: "",
      acceptedPrivacy: false,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "氏名を入力してください",
        "メールアドレスの形式で入力してください",
        "問い合わせ内容を入力してください",
        "プライバシーポリシーに同意してください",
      ]),
    );
  });

  it("問い合わせ本文は改行を許可し、制御文字と上限超過を拒否する", () => {
    expect(contactFormSchema.safeParse({ ...validForm, message: "1行目\n2行目" }).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...validForm, message: "不正\u0000文字" }).success).toBe(false);
    expect(
      contactFormSchema.safeParse({ ...validForm, message: "あ".repeat(CONTACT_MESSAGE_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("送信時はUUIDとTurnstile tokenを要求する", () => {
    expect(
      submitContactSchema.safeParse({
        ...validForm,
        requestId: "718cf80f-d4fb-4a5d-bf20-ad48044f31eb",
        turnstileToken: "turnstile-token",
      }).success,
    ).toBe(true);
    expect(submitContactSchema.safeParse({ ...validForm, requestId: "invalid", turnstileToken: "" }).success).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildContactEmailSubject, buildContactEmailText } from "./email";
import type { ContactDeliveryInput } from "./schemas";

const baseInput: Omit<ContactDeliveryInput, "type"> = {
  name: "山田 太郎",
  email: "taro.yamada@example.com",
  organization: "居酒屋さくら",
  message: "問い合わせ本文です。\n2行目です。",
  requestId: "11111111-1111-4111-8111-111111111111",
};

describe("contact/email", () => {
  it.each([
    ["introduction", "利用開始について"],
    ["usage", "機能や使い方"],
    ["trouble", "不具合・トラブル"],
    ["other", "その他"],
  ] as const)("%s の問い合わせ種別を件名と本文へ反映する", (type, label) => {
    const input = { ...baseInput, type };

    expect(buildContactEmailSubject(type)).toBe(`【シフトリ】${label}の問い合わせ`);
    expect(buildContactEmailText(input)).toBe(
      [
        `問い合わせ種別: ${label}`,
        "氏名: 山田 太郎",
        "メールアドレス: taro.yamada@example.com",
        "店舗名または会社名: 居酒屋さくら",
        "リクエストID: 11111111-1111-4111-8111-111111111111",
        "",
        "問い合わせ内容:",
        "問い合わせ本文です。",
        "2行目です。",
      ].join("\n"),
    );
  });

  it("店舗名または会社名が空なら未入力と表示する", () => {
    expect(buildContactEmailText({ ...baseInput, type: "other", organization: "" })).toContain(
      "店舗名または会社名: 未入力",
    );
  });
});

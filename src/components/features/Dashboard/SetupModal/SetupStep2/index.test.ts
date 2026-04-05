import { describe, expect, it } from "vitest";
import { step2Schema } from "./index";

describe("step2Schema (ownerProfile)", () => {
  const validData = {
    name: "山田 太郎",
    email: "yamada@example.com",
  };

  it("有効なデータを受け入れる", () => {
    const result = step2Schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("名前が空の場合エラー", () => {
    const result = step2Schema.safeParse({ ...validData, name: "" });
    expect(result.success).toBe(false);
  });

  it("メールアドレスが空の場合エラー", () => {
    const result = step2Schema.safeParse({ ...validData, email: "" });
    expect(result.success).toBe(false);
  });

  it("メールアドレスが不正な形式の場合エラー", () => {
    const result = step2Schema.safeParse({ ...validData, email: "invalid-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("email"));
      expect(error?.message).toBe("正しいメールアドレスを入力してください");
    }
  });

  it("有効なメールアドレスを受け入れる", () => {
    const result = step2Schema.safeParse({ ...validData, email: "test+tag@sub.domain.co.jp" });
    expect(result.success).toBe(true);
  });
});

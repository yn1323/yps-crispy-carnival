import { describe, expect, it } from "vitest";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "@/convex/constants";
import { editStaffSchema } from "./index";

describe("editStaffSchema", () => {
  it("名前+メール入力済みで有効", () => {
    const result = editStaffSchema.safeParse({ name: "田中 花子", email: "hanako@example.com" });
    expect(result.success).toBe(true);
  });

  it("名前が空の場合エラー", () => {
    const result = editStaffSchema.safeParse({ name: "", email: "hanako@example.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "名前を入力してください")).toBe(true);
    }
  });

  it("名前が空白のみの場合エラー", () => {
    const result = editStaffSchema.safeParse({ name: "  ", email: "hanako@example.com" });
    expect(result.success).toBe(false);
  });

  it("名前の最大文字数と制御文字を検証する", () => {
    expect(
      editStaffSchema.safeParse({ name: "あ".repeat(PERSON_NAME_MAX_LENGTH), email: "hanako@example.com" }).success,
    ).toBe(true);
    expect(
      editStaffSchema.safeParse({ name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1), email: "hanako@example.com" }).success,
    ).toBe(false);
    expect(editStaffSchema.safeParse({ name: "田中\n花子", email: "hanako@example.com" }).success).toBe(false);
  });

  it("メールが空で名前ありはエラー", () => {
    const result = editStaffSchema.safeParse({ name: "田中 花子", email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("メールアドレスを入力してください");
    }
  });

  it.each([
    ["hanako@example.com"],
    ["user+tag@example.co.jp"],
    ["test.name@sub.domain.com"],
  ])("有効なメールアドレスを受け入れる: %s", (email) => {
    const result = editStaffSchema.safeParse({ name: "田中", email });
    expect(result.success).toBe(true);
  });

  it.each([
    ["invalid-email"],
    ["@example.com"],
    ["hanako@"],
    ["hanako @example.com"],
  ])("無効なメールアドレスを拒否する: %s", (email) => {
    const result = editStaffSchema.safeParse({ name: "田中", email });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("メールアドレスの形式で入力してください");
    }
  });

  it("空白のみメールは必須エラーにする", () => {
    const result = editStaffSchema.safeParse({ name: "田中", email: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("メールアドレスを入力してください");
    }
  });

  it("メールアドレスの最大文字数を検証する", () => {
    const local = "a".repeat(64);
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
    const maxEmail = `${local}@${domain}`;
    expect(maxEmail).toHaveLength(EMAIL_MAX_LENGTH);
    expect(editStaffSchema.safeParse({ name: "田中", email: maxEmail }).success).toBe(true);
    expect(editStaffSchema.safeParse({ name: "田中", email: `${maxEmail}x` }).success).toBe(false);
  });
});

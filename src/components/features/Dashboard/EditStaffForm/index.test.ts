import { describe, expect, it } from "vitest";
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
    ["   "],
  ])("無効なメールアドレスを拒否する: %s", (email) => {
    const result = editStaffSchema.safeParse({ name: "田中", email });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("正しいメールアドレスを入力してください");
    }
  });
});

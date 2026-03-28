import { describe, expect, it } from "vitest";
import { addStaffSchema, staffEntrySchema } from "./index";

describe("staffEntrySchema", () => {
  it("名前・メールともに空で有効", () => {
    const result = staffEntrySchema.safeParse({ name: "", email: "" });
    expect(result.success).toBe(true);
  });

  it("名前あり・メールなしはエラー", () => {
    const result = staffEntrySchema.safeParse({ name: "田中 花子", email: "" });
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
    const result = staffEntrySchema.safeParse({ name: "田中", email });
    expect(result.success).toBe(true);
  });

  it.each([
    ["invalid-email"],
    ["@example.com"],
    ["hanako@"],
    ["hanako @example.com"],
    ["   "],
  ])("無効なメールアドレスを拒否する: %s", (email) => {
    const result = staffEntrySchema.safeParse({ name: "田中", email });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("正しいメールアドレスを入力してください");
    }
  });

  it.each([
    ["", "名前なし"],
    ["  ", "名前空白のみ"],
  ])("メールあり%sはエラー", (name) => {
    const result = staffEntrySchema.safeParse({ name, email: "test@example.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名前を入力してください");
    }
  });
});

describe("addStaffSchema", () => {
  it("空の配列はエラー", () => {
    const result = addStaffSchema.safeParse({ entries: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("少なくとも1人のスタッフ名を入力してください");
    }
  });

  it("名前が全て空のエントリのみはエラー", () => {
    const result = addStaffSchema.safeParse({
      entries: [
        { name: "", email: "" },
        { name: "  ", email: "test@example.com" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("複数エントリを受け入れる", () => {
    const result = addStaffSchema.safeParse({
      entries: [
        { name: "田中", email: "tanaka@example.com" },
        { name: "佐藤", email: "sato@example.com" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("無効なメールを含むエントリを拒否する", () => {
    const result = addStaffSchema.safeParse({
      entries: [
        { name: "田中", email: "valid@example.com" },
        { name: "佐藤", email: "not-an-email" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

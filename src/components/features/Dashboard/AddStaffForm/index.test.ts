import { describe, expect, it } from "vitest";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH, STAFF_ADD_ENTRIES_MAX } from "@/convex/constants";
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
  ])("無効なメールアドレスを拒否する: %s", (email) => {
    const result = staffEntrySchema.safeParse({ name: "田中", email });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("正しいメールアドレスを入力してください");
    }
  });

  it("空白のみメールは必須エラーにする", () => {
    const result = staffEntrySchema.safeParse({ name: "田中", email: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("メールアドレスを入力してください");
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

  it("名前とメールの最大文字数・制御文字を検証する", () => {
    expect(
      staffEntrySchema.safeParse({
        name: "あ".repeat(PERSON_NAME_MAX_LENGTH),
        email: "hanako@example.com",
      }).success,
    ).toBe(true);
    expect(
      staffEntrySchema.safeParse({
        name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1),
        email: "hanako@example.com",
      }).success,
    ).toBe(false);
    expect(staffEntrySchema.safeParse({ name: "田中\n花子", email: "hanako@example.com" }).success).toBe(false);

    const local = "a".repeat(64);
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
    const maxEmail = `${local}@${domain}`;
    expect(maxEmail).toHaveLength(EMAIL_MAX_LENGTH);
    expect(staffEntrySchema.safeParse({ name: "田中", email: maxEmail }).success).toBe(true);
    expect(staffEntrySchema.safeParse({ name: "田中", email: `${maxEmail}x` }).success).toBe(false);
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

  it("一度に追加できるスタッフは50件まで", () => {
    const valid = addStaffSchema.safeParse({
      entries: Array.from({ length: STAFF_ADD_ENTRIES_MAX }, (_, index) => ({
        name: `スタッフ${index + 1}`,
        email: `staff-${index + 1}@example.com`,
      })),
    });
    expect(valid.success).toBe(true);

    const invalid = addStaffSchema.safeParse({
      entries: Array.from({ length: STAFF_ADD_ENTRIES_MAX + 1 }, (_, index) => ({
        name: `スタッフ${index + 1}`,
        email: `staff-${index + 1}@example.com`,
      })),
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.some((issue) => issue.message === "スタッフは一度に50件まで追加できます")).toBe(true);
    }
  });
});

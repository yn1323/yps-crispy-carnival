import { describe, expect, it } from "vitest";
import { addStaffSchema, staffEntrySchema } from "./index";

describe("staffEntrySchema", () => {
  it("名前・メールともに空で有効", () => {
    const result = staffEntrySchema.safeParse({ name: "", email: "" });
    expect(result.success).toBe(true);
  });

  it("名前のみ入力で有効", () => {
    const result = staffEntrySchema.safeParse({ name: "田中 花子", email: "" });
    expect(result.success).toBe(true);
  });

  it("有効なメールアドレスを受け入れる", () => {
    const result = staffEntrySchema.safeParse({ name: "", email: "hanako@example.com" });
    expect(result.success).toBe(true);
  });

  it("無効なメールアドレスを拒否する", () => {
    const result = staffEntrySchema.safeParse({ name: "", email: "invalid-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("正しいメールアドレスを入力してください");
    }
  });

  it("空白のみのメールアドレスは有効（空扱い）", () => {
    const result = staffEntrySchema.safeParse({ name: "", email: "   " });
    expect(result.success).toBe(true);
  });
});

describe("addStaffSchema", () => {
  it("空の配列を受け入れる", () => {
    const result = addStaffSchema.safeParse({ entries: [] });
    expect(result.success).toBe(true);
  });

  it("複数エントリを受け入れる", () => {
    const result = addStaffSchema.safeParse({
      entries: [
        { name: "田中", email: "tanaka@example.com" },
        { name: "佐藤", email: "" },
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

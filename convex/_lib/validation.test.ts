import { describe, expect, it } from "vitest";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "../constants";
import {
  getInclusiveIsoDateSpanDays,
  isoDateStringSchema,
  isValidIsoDateString,
  requiredDisplayTextSchema,
  requiredEmailSchema,
  supportedShiftTimeSchema,
} from "./validation";

describe("requiredDisplayTextSchema", () => {
  const schema = requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH });

  it("前後空白をtrimして受け入れる", () => {
    const result = schema.safeParse("  山田 太郎  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("山田 太郎");
  });

  it("最大文字数ちょうどは受け入れ、超過は拒否する", () => {
    expect(schema.safeParse("あ".repeat(PERSON_NAME_MAX_LENGTH)).success).toBe(true);
    expect(schema.safeParse("あ".repeat(PERSON_NAME_MAX_LENGTH + 1)).success).toBe(false);
  });

  it("制御文字を拒否する", () => {
    const result = schema.safeParse("山田\n太郎");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("名前に使用できない文字が含まれています");
  });
});

describe("requiredEmailSchema", () => {
  it("前後空白をtrimして受け入れる", () => {
    const result = requiredEmailSchema.safeParse("  USER@example.com  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("USER@example.com");
  });

  it("最大254文字まで受け入れる", () => {
    const local = "a".repeat(64);
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.com`;
    const email = `${local}@${domain}`;
    expect(email).toHaveLength(EMAIL_MAX_LENGTH);
    expect(requiredEmailSchema.safeParse(email).success).toBe(true);
    expect(requiredEmailSchema.safeParse(`${email}x`).success).toBe(false);
  });

  it("不正形式と制御文字を拒否する", () => {
    expect(requiredEmailSchema.safeParse("not-an-email").success).toBe(false);
    expect(requiredEmailSchema.safeParse("user\n@example.com").success).toBe(false);
  });
});

describe("isoDateStringSchema", () => {
  const schema = isoDateStringSchema();

  it("実在するYYYY-MM-DDのみ受け入れる", () => {
    expect(schema.safeParse("2026-02-28").success).toBe(true);
    expect(schema.safeParse("2024-02-29").success).toBe(true);
    expect(schema.safeParse("2026-02-29").success).toBe(false);
    expect(schema.safeParse("2026-13-01").success).toBe(false);
    expect(schema.safeParse("2026/02/28").success).toBe(false);
  });

  it("日数を包括日数で計算する", () => {
    expect(isValidIsoDateString("2026-04-01")).toBe(true);
    expect(getInclusiveIsoDateSpanDays("2026-04-01", "2026-04-01")).toBe(1);
    expect(getInclusiveIsoDateSpanDays("2026-04-01", "2026-04-30")).toBe(30);
    expect(getInclusiveIsoDateSpanDays("2026-02-31", "2026-04-30")).toBeNull();
  });
});

describe("supportedShiftTimeSchema", () => {
  const schema = supportedShiftTimeSchema();

  it("サポート済み時刻だけ受け入れる", () => {
    expect(schema.safeParse("00:00").success).toBe(true);
    expect(schema.safeParse("36:00").success).toBe(true);
    expect(schema.safeParse("36:30").success).toBe(false);
    expect(schema.safeParse("10:60").success).toBe(false);
    expect(schema.safeParse("bad").success).toBe(false);
  });
});

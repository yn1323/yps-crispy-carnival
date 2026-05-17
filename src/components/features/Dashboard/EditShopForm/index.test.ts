import { describe, expect, it } from "vitest";
import { editShopSchema } from "./index";

describe("editShopSchema", () => {
  const validData = {
    shopName: "居酒屋たなか",
    regularClosedDays: ["mon", "tue"],
    submissionPattern: { kind: "dateOnly" as const },
  };

  it("日ごとの提出方法は時間なしで受け入れる", () => {
    const result = editShopSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("定休日なしの店舗設定を受け入れる", () => {
    const result = editShopSchema.safeParse({ ...validData, regularClosedDays: [] });
    expect(result.success).toBe(true);
  });

  it("定義外の曜日はエラー", () => {
    const result = editShopSchema.safeParse({ ...validData, regularClosedDays: ["holiday"] });
    expect(result.success).toBe(false);
  });

  it("時間指定は開始時間と終了時間を必須にする", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "14:00", endTime: "25:00" },
    });
    expect(result.success).toBe(true);
  });

  it("時間指定の終了時間が開始時間以前の場合エラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "22:00", endTime: "22:00" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("endTime"));
      expect(error?.message).toBe("終了時間は開始時間より後にしてください");
    }
  });

  it("勤務区分の提出方法を受け入れる", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "14:00", endTime: "18:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "18:00", endTime: "25:00", sortOrder: 1 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("勤務区分の重複時間帯はエラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "14:00", endTime: "18:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "14:00", endTime: "18:00", sortOrder: 1 },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("勤務区分の空名はエラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "morning", name: " ", startTime: "09:00", endTime: "18:00", sortOrder: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("勤務区分の終了時間が開始時間以前の場合エラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "night", name: "深夜", startTime: "25:00", endTime: "25:00", sortOrder: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });
});

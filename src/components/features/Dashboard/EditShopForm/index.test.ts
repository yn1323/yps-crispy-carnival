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

  it("時間指定の対応範囲外の時刻はエラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "99:00" },
    });
    expect(result.success).toBe(false);
  });

  it("時間指定は翌12:00まで受け入れる", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "00:00", endTime: "36:00" },
    });
    expect(result.success).toBe(true);
  });

  it("時間指定は翌12:00を超える時刻をエラーにする", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "00:00", endTime: "36:30" },
    });
    expect(result.success).toBe(false);
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

  it("勤務区分の時間帯重複は受け入れる", () => {
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
    expect(result.success).toBe(true);
  });

  it("勤務区分が1つもない場合はエラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "勤務区分を1つ以上追加してください")).toBe(true);
    }
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

  it("勤務区分名の重複はエラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "早番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
        ],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "勤務区分名が重複しています")).toBe(true);
    }
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

  it("勤務区分の対応範囲外の時刻はエラー", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "night", name: "深夜", startTime: "10:00", endTime: "99:00", sortOrder: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("勤務区分は翌12:00まで受け入れる", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "night", name: "深夜", startTime: "24:00", endTime: "36:00", sortOrder: 0 }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("勤務区分は4件まで", () => {
    const result = editShopSchema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: Array.from({ length: 5 }, (_, index) => ({
          id: `option-${index}`,
          name: `区分${index + 1}`,
          startTime: "09:00",
          endTime: "18:00",
          sortOrder: index,
        })),
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "勤務区分は4件まで登録できます")).toBe(true);
    }
  });
});

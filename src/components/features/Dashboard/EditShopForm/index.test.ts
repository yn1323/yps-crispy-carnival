import { describe, expect, it } from "vitest";
import { editShopSchema } from "./index";

describe("editShopSchema", () => {
  const validData = {
    shopName: "居酒屋たなか",
    shiftStartTime: "14:00",
    shiftEndTime: "25:00",
    regularClosedDays: ["mon", "tue"],
  };

  it("定休日を含む店舗設定を受け入れる", () => {
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

  it("終了時間が開始時間以前の場合エラー", () => {
    const result = editShopSchema.safeParse({ ...validData, shiftStartTime: "22:00", shiftEndTime: "22:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find((i) => i.path.includes("shiftEndTime"));
      expect(error?.message).toBe("終了時間は開始時間より後にしてください");
    }
  });
});

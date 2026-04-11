import { describe, expect, it } from "vitest";
import { step1Schema } from "./index";

describe("step1Schema", () => {
  const validData = {
    shopName: "居酒屋たなか",
    shiftStartTime: "14:00",
    shiftEndTime: "25:00",
  };

  it("有効なデータを受け入れる", () => {
    const result = step1Schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("店舗名が空の場合エラー", () => {
    const result = step1Schema.safeParse({ ...validData, shopName: "" });
    expect(result.success).toBe(false);
  });

  it("開始時間が未選択の場合エラー", () => {
    const result = step1Schema.safeParse({ ...validData, shiftStartTime: "" });
    expect(result.success).toBe(false);
  });

  it("終了時間が未選択の場合エラー", () => {
    const result = step1Schema.safeParse({ ...validData, shiftEndTime: "" });
    expect(result.success).toBe(false);
  });

  it("終了時間が開始時間より後なら有効", () => {
    const result = step1Schema.safeParse({
      ...validData,
      shiftStartTime: "10:00",
      shiftEndTime: "18:00",
    });
    expect(result.success).toBe(true);
  });

  it("終了時間が開始時間と同じ場合エラー", () => {
    const result = step1Schema.safeParse({
      ...validData,
      shiftStartTime: "10:00",
      shiftEndTime: "10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endTimeError = result.error.issues.find((i) => i.path.includes("shiftEndTime"));
      expect(endTimeError?.message).toBe("終了時間は開始時間より後にしてください");
    }
  });

  it("終了時間が開始時間より前の場合エラー", () => {
    const result = step1Schema.safeParse({
      ...validData,
      shiftStartTime: "18:00",
      shiftEndTime: "10:00",
    });
    expect(result.success).toBe(false);
  });

  it("翌日の終了時間（24:00以降）を受け入れる", () => {
    const result = step1Schema.safeParse({
      ...validData,
      shiftStartTime: "22:00",
      shiftEndTime: "27:00",
    });
    expect(result.success).toBe(true);
  });
});

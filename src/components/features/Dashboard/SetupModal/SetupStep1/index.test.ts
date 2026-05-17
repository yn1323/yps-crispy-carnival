import { describe, expect, it } from "vitest";
import { step1Schema } from "./index";

describe("step1Schema", () => {
  const validData = {
    shopName: "居酒屋たなか",
    submissionPattern: { kind: "dateOnly" as const },
  };

  it("日ごとの提出方法は時間なしで受け入れる", () => {
    const result = step1Schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("店舗名が空の場合エラー", () => {
    const result = step1Schema.safeParse({ ...validData, shopName: "" });
    expect(result.success).toBe(false);
  });

  it("時間指定は開始時間と終了時間を受け入れる", () => {
    const result = step1Schema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "18:00" },
    });
    expect(result.success).toBe(true);
  });

  it("時間指定の終了時間が開始時間と同じ場合エラー", () => {
    const result = step1Schema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "10:00" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endTimeError = result.error.issues.find((i) => i.path.includes("endTime"));
      expect(endTimeError?.message).toBe("終了時間は開始時間より後にしてください");
    }
  });

  it("時間指定は翌日の終了時間（24:00以降）を受け入れる", () => {
    const result = step1Schema.safeParse({
      ...validData,
      submissionPattern: { kind: "time", startTime: "22:00", endTime: "27:00" },
    });
    expect(result.success).toBe(true);
  });

  it("勤務区分の提出方法を受け入れる", () => {
    const result = step1Schema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "18:00", sortOrder: 0 }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("勤務区分の空名はエラー", () => {
    const result = step1Schema.safeParse({
      ...validData,
      submissionPattern: {
        kind: "shiftType",
        options: [{ id: "morning", name: " ", startTime: "09:00", endTime: "18:00", sortOrder: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { submitFormSchema } from "./schema";

const baseEntry = { date: "2026-04-07", isWorking: false, startTime: "09:00", endTime: "18:00" };

describe("submitFormSchema", () => {
  it("全日休み → 成功", () => {
    const result = submitFormSchema.safeParse({
      entries: [baseEntry, { ...baseEntry, date: "2026-04-08" }],
    });
    expect(result.success).toBe(true);
  });

  it("出勤日で start < end → 成功", () => {
    const result = submitFormSchema.safeParse({
      entries: [{ ...baseEntry, isWorking: true, startTime: "09:00", endTime: "18:00" }],
    });
    expect(result.success).toBe(true);
  });

  it("出勤日で start === end → エラー", () => {
    const result = submitFormSchema.safeParse({
      entries: [{ ...baseEntry, isWorking: true, startTime: "10:00", endTime: "10:00" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("終了時間は開始時間より後にしてください");
    }
  });

  it("出勤日で start > end → エラー", () => {
    const result = submitFormSchema.safeParse({
      entries: [{ ...baseEntry, isWorking: true, startTime: "18:00", endTime: "09:00" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("終了時間は開始時間より後にしてください");
    }
  });

  it("休み日は start >= end でもエラーにならない", () => {
    const result = submitFormSchema.safeParse({
      entries: [{ ...baseEntry, isWorking: false, startTime: "18:00", endTime: "09:00" }],
    });
    expect(result.success).toBe(true);
  });

  it("混在（出勤日OK + 休み日）→ 成功", () => {
    const result = submitFormSchema.safeParse({
      entries: [
        { ...baseEntry, isWorking: true, startTime: "09:00", endTime: "18:00" },
        { ...baseEntry, date: "2026-04-08", isWorking: false },
        { ...baseEntry, date: "2026-04-09", isWorking: true, startTime: "10:00", endTime: "15:00" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("混在（出勤日NG含む）→ エラー", () => {
    const result = submitFormSchema.safeParse({
      entries: [
        { ...baseEntry, isWorking: true, startTime: "09:00", endTime: "18:00" },
        { ...baseEntry, date: "2026-04-08", isWorking: true, startTime: "18:00", endTime: "09:00" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

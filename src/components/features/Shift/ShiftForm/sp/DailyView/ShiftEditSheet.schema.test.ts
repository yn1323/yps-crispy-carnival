import { describe, expect, it } from "vitest";
import { addTimeSchema } from "./ShiftEditSheet.schema";

describe("addTimeSchema", () => {
  it("両方空 → エラー", () => {
    const result = addTimeSchema.safeParse({ startTime: "", endTime: "" });
    expect(result.success).toBe(false);
  });

  it("startTimeのみ → エラー", () => {
    const result = addTimeSchema.safeParse({ startTime: "10:00", endTime: "" });
    expect(result.success).toBe(false);
  });

  it("endTimeのみ → エラー", () => {
    const result = addTimeSchema.safeParse({ startTime: "", endTime: "18:00" });
    expect(result.success).toBe(false);
  });

  it("start < end → 成功", () => {
    const result = addTimeSchema.safeParse({ startTime: "10:00", endTime: "18:00" });
    expect(result.success).toBe(true);
  });

  it("start === end → エラー", () => {
    const result = addTimeSchema.safeParse({ startTime: "10:00", endTime: "10:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("終了時間は開始時間より後にしてください");
    }
  });

  it("start > end → エラー", () => {
    const result = addTimeSchema.safeParse({ startTime: "18:00", endTime: "10:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("終了時間は開始時間より後にしてください");
    }
  });
});

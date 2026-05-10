import { describe, expect, it } from "vitest";
import type { TimeRange } from "@/src/domains/shift/types";
import { generateTimeOptions } from "./ShiftEditSheet";
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

describe("generateTimeOptions", () => {
  it("編集可能境界の05:30から22:30までを候補にする", () => {
    const timeRange: TimeRange = {
      start: 5,
      end: 23,
      unit: 30,
      editableStartMinutes: 330,
      editableEndMinutes: 1350,
    };

    const options = generateTimeOptions(timeRange);

    expect(options[0]).toEqual({ value: "05:30", label: "05:30" });
    expect(options.at(-1)).toEqual({ value: "22:30", label: "22:30" });
    expect(options.some((option) => option.value === "05:00")).toBe(false);
    expect(options.some((option) => option.value === "23:00")).toBe(false);
  });
});

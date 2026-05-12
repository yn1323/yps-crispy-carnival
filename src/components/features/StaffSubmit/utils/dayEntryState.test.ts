import { describe, expect, it } from "vitest";
import type { DayEntry } from "../DayCard";
import { buildRestEntry, buildWorkingEntry } from "./dayEntryState";
import type { PreviousWeeklyPattern } from "./previousWeeklyPattern";

const baseEntry: DayEntry = {
  date: "2026-04-15",
  isWorking: false,
  startTime: "09:00",
  endTime: "22:00",
};

const previousWeeklyPattern: PreviousWeeklyPattern = {
  sourceWeekStart: "2026-04-06",
  days: [{ weekday: 3, startTime: "10:00", endTime: "18:00" }],
};

describe("dayEntryState", () => {
  it("別の日付でも直前に入力していた時間を前回シフトより優先して出勤状態にする", () => {
    const entry = buildWorkingEntry({
      entry: { ...baseEntry, date: "2026-04-16" },
      timeRange: { startTime: "09:00", endTime: "22:00" },
      previousWeeklyPattern,
      latestWorkingTime: { startTime: "12:00", endTime: "17:00" },
    });

    expect(entry).toEqual({ date: "2026-04-16", isWorking: true, startTime: "12:00", endTime: "17:00" });
  });

  it("直前の入力がなければ、前回シフトの曜日パターンを出勤時の初期値にする", () => {
    const entry = buildWorkingEntry({
      entry: baseEntry,
      timeRange: { startTime: "09:00", endTime: "22:00" },
      previousWeeklyPattern,
    });

    expect(entry).toEqual({ date: "2026-04-15", isWorking: true, startTime: "10:00", endTime: "18:00" });
  });

  it("休みに戻しても開始・終了時刻は保持する", () => {
    const entry = buildRestEntry({ ...baseEntry, isWorking: true, startTime: "11:00", endTime: "19:00" });

    expect(entry).toEqual({ date: "2026-04-15", isWorking: false, startTime: "11:00", endTime: "19:00" });
  });
});

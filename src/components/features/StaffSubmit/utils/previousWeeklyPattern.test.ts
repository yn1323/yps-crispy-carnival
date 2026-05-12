import { describe, expect, it } from "vitest";
import {
  buildEntriesFromPreviousWeeklyPattern,
  buildWorkingEntryFromPreviousWeeklyPattern,
  type PreviousWeeklyPattern,
} from "./previousWeeklyPattern";

const pattern: PreviousWeeklyPattern = {
  sourceWeekStart: "2026-04-06",
  days: [
    { weekday: 1, startTime: "09:00", endTime: "17:00" },
    { weekday: 3, startTime: "10:00", endTime: "18:00" },
  ],
};

describe("buildEntriesFromPreviousWeeklyPattern", () => {
  it("曜日パターンを1週間の対象期間へ反映する", () => {
    const entries = buildEntriesFromPreviousWeeklyPattern(["2026-04-13", "2026-04-14", "2026-04-15"], pattern, {
      startTime: "09:00",
      endTime: "22:00",
    });

    expect(entries).toEqual([
      { date: "2026-04-13", isWorking: true, startTime: "09:00", endTime: "17:00" },
      { date: "2026-04-14", isWorking: false, startTime: "09:00", endTime: "22:00" },
      { date: "2026-04-15", isWorking: true, startTime: "10:00", endTime: "18:00" },
    ]);
  });

  it("2週間以上の対象期間では同じ曜日パターンを繰り返す", () => {
    const entries = buildEntriesFromPreviousWeeklyPattern(["2026-04-13", "2026-04-20", "2026-04-22"], pattern, {
      startTime: "09:00",
      endTime: "22:00",
    });

    expect(entries.filter((entry) => entry.isWorking)).toEqual([
      { date: "2026-04-13", isWorking: true, startTime: "09:00", endTime: "17:00" },
      { date: "2026-04-20", isWorking: true, startTime: "09:00", endTime: "17:00" },
      { date: "2026-04-22", isWorking: true, startTime: "10:00", endTime: "18:00" },
    ]);
  });

  it("前回時間が今回の募集時間外なら範囲内へ丸める", () => {
    const entries = buildEntriesFromPreviousWeeklyPattern(
      ["2026-04-13"],
      { sourceWeekStart: "2026-04-06", days: [{ weekday: 1, startTime: "08:00", endTime: "23:00" }] },
      { startTime: "09:00", endTime: "22:00" },
    );

    expect(entries[0]).toEqual({ date: "2026-04-13", isWorking: true, startTime: "09:00", endTime: "22:00" });
  });

  it("丸め後に無効な時間帯になる日は休みにする", () => {
    const entries = buildEntriesFromPreviousWeeklyPattern(
      ["2026-04-13"],
      { sourceWeekStart: "2026-04-06", days: [{ weekday: 1, startTime: "07:00", endTime: "08:00" }] },
      { startTime: "09:00", endTime: "22:00" },
    );

    expect(entries[0]).toEqual({ date: "2026-04-13", isWorking: false, startTime: "09:00", endTime: "22:00" });
  });
});

describe("buildWorkingEntryFromPreviousWeeklyPattern", () => {
  it("対象日の曜日に一致する前回時間を出勤行として返す", () => {
    const entry = buildWorkingEntryFromPreviousWeeklyPattern("2026-04-15", pattern, {
      startTime: "09:00",
      endTime: "22:00",
    });

    expect(entry).toEqual({ date: "2026-04-15", isWorking: true, startTime: "10:00", endTime: "18:00" });
  });

  it("対象曜日が前回パターンにない場合はnullを返す", () => {
    const entry = buildWorkingEntryFromPreviousWeeklyPattern("2026-04-14", pattern, {
      startTime: "09:00",
      endTime: "22:00",
    });

    expect(entry).toBeNull();
  });
});

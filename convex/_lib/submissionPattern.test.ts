import { describe, expect, it } from "vitest";
import { getSubmissionPatternTimeRange, type ShiftSubmissionPattern } from "./submissionPattern";

describe("getSubmissionPatternTimeRange", () => {
  it("時間指定は設定された時間範囲を返す", () => {
    expect(getSubmissionPatternTimeRange({ kind: "time", startTime: "08:30", endTime: "23:30" })).toEqual({
      startTime: "08:30",
      endTime: "23:30",
    });
  });

  it("勤務区分は並び順に関係なく最小開始時刻から最大終了時刻までを返す", () => {
    const pattern: ShiftSubmissionPattern = {
      kind: "shiftType",
      options: [
        { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
        { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
      ],
    };

    expect(getSubmissionPatternTimeRange(pattern)).toEqual({ startTime: "09:00", endTime: "21:00" });
  });

  it("日付のみはデフォルトの時間範囲を返す", () => {
    expect(getSubmissionPatternTimeRange({ kind: "dateOnly" })).toEqual({
      startTime: "09:00",
      endTime: "22:00",
    });
  });

  it("勤務区分が空の場合はデフォルトの時間範囲を返す", () => {
    expect(getSubmissionPatternTimeRange({ kind: "shiftType", options: [] })).toEqual({
      startTime: "09:00",
      endTime: "22:00",
    });
  });
});

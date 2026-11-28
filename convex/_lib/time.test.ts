import { describe, expect, it } from "vitest";
import {
  buildShiftTimeLabel,
  formatShiftClockTime,
  formatShiftClockTimeRange,
  isSupportedShiftTime,
  MAX_SHIFT_TIME_MINUTES,
} from "./time";

describe("time", () => {
  it("対応するシフト時刻の範囲を判定できる", () => {
    expect(isSupportedShiftTime("36:00")).toBe(true);
    expect(isSupportedShiftTime("36:30")).toBe(false);
    expect(MAX_SHIFT_TIME_MINUTES).toBe(36 * 60);
  });

  it("24時以降を翌日表記に変換できる", () => {
    expect(formatShiftClockTime("25:00")).toBe("翌1:00");
    expect(formatShiftClockTimeRange("21:00", "35:00", "-")).toBe("21:00-翌11:00");
  });

  it("通知用の勤務時間ラベルを組み立てられる", () => {
    expect(
      buildShiftTimeLabel([{ startTime: "21:00", endTime: "25:00", optionId: "late" }], {
        kind: "shiftType",
        options: [{ id: "late", name: "遅番", startTime: "21:00", endTime: "25:00" }],
      }),
    ).toBe("遅番（21:00-翌1:00）");
  });

  describe("buildShiftTimeLabel", () => {
    const shiftTypePattern = {
      kind: "shiftType" as const,
      options: [
        { id: "early", name: "早番", startTime: "09:00", endTime: "15:00" },
        { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00" },
      ],
    };
    const lunch = { startTime: "14:00", endTime: "15:00" };

    it("勤務がなければnullを返す", () => {
      expect(buildShiftTimeLabel([], { kind: "time" })).toBeNull();
      expect(buildShiftTimeLabel([], { kind: "dateOnly" })).toBeNull();
      expect(buildShiftTimeLabel([], shiftTypePattern)).toBeNull();
    });

    it("ポジション名と休憩がなければ、時間指定は従来の文字列のままである", () => {
      expect(buildShiftTimeLabel([{ startTime: "10:00", endTime: "19:00" }], { kind: "time" })).toBe("10:00-19:00");
      expect(
        buildShiftTimeLabel(
          [
            { startTime: "17:00", endTime: "22:00" },
            { startTime: "10:00", endTime: "14:00", breaks: [] },
          ],
          { kind: "time" },
        ),
      ).toBe("10:00-14:00 / 17:00-22:00");
    });

    it("ポジション名と休憩がなければ、パターン選択は従来の文字列のままである", () => {
      expect(
        buildShiftTimeLabel(
          [
            { startTime: "15:00", endTime: "22:00", optionId: "late" },
            { startTime: "09:00", endTime: "15:00", optionId: "early" },
          ],
          shiftTypePattern,
        ),
      ).toBe("早番（09:00-15:00） / 遅番（15:00-22:00）");
      expect(
        buildShiftTimeLabel([{ startTime: "10:00", endTime: "12:00", optionId: "removed" }], shiftTypePattern),
      ).toBe("10:00-12:00");
    });

    it("ポジション名と休憩がなければ、日付選択は従来の文字列のままである", () => {
      expect(buildShiftTimeLabel([{ startTime: "09:00", endTime: "22:00" }], { kind: "dateOnly" })).toBe("出勤");
    });

    it("時間指定は、時刻の後ろへポジション名と休憩を添える", () => {
      expect(
        buildShiftTimeLabel([{ startTime: "10:00", endTime: "19:00", positionName: "ホール", breaks: [lunch] }], {
          kind: "time",
        }),
      ).toBe("10:00-19:00 ホール（休憩 14:00-15:00）");
      expect(
        buildShiftTimeLabel(
          [
            { startTime: "17:00", endTime: "22:00", positionName: "キッチン" },
            {
              startTime: "10:00",
              endTime: "14:00",
              positionName: "ホール",
              breaks: [{ startTime: "12:00", endTime: "12:30" }],
            },
          ],
          { kind: "time" },
        ),
      ).toBe("10:00-14:00 ホール（休憩 12:00-12:30） / 17:00-22:00 キッチン");
    });

    it("ポジション名だけ、休憩だけの勤務は、ある方だけを添える", () => {
      expect(
        buildShiftTimeLabel([{ startTime: "10:00", endTime: "19:00", positionName: "ホール" }], { kind: "time" }),
      ).toBe("10:00-19:00 ホール");
      expect(buildShiftTimeLabel([{ startTime: "10:00", endTime: "19:00", breaks: [lunch] }], { kind: "time" })).toBe(
        "10:00-19:00（休憩 14:00-15:00）",
      );
    });

    it("休憩が複数あれば、開始順に読点でつなぐ", () => {
      expect(
        buildShiftTimeLabel(
          [
            {
              startTime: "10:00",
              endTime: "26:00",
              positionName: "ホール",
              breaks: [
                { startTime: "24:30", endTime: "25:00" },
                { startTime: "12:00", endTime: "12:30" },
              ],
            },
          ],
          { kind: "time" },
        ),
      ).toBe("10:00-翌2:00 ホール（休憩 12:00-12:30、翌0:30-翌1:00）");
    });

    it("パターン選択は、パターン名と時刻の後ろへポジション名と休憩を添える", () => {
      expect(
        buildShiftTimeLabel(
          [
            {
              startTime: "09:00",
              endTime: "15:00",
              optionId: "early",
              positionName: "ホール",
              breaks: [{ startTime: "12:00", endTime: "13:00" }],
            },
          ],
          shiftTypePattern,
        ),
      ).toBe("早番（09:00-15:00） ホール（休憩 12:00-13:00）");
    });

    it("日付選択は「出勤」の後ろへポジション名と休憩を添える", () => {
      expect(
        buildShiftTimeLabel([{ startTime: "09:00", endTime: "22:00", positionName: "ホール", breaks: [lunch] }], {
          kind: "dateOnly",
        }),
      ).toBe("出勤 ホール（休憩 14:00-15:00）");
      expect(
        buildShiftTimeLabel([{ startTime: "09:00", endTime: "22:00", positionName: "ホール" }], { kind: "dateOnly" }),
      ).toBe("出勤 ホール");
    });
  });
});

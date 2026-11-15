import { describe, expect, it } from "vitest";
import { BREAK_POSITION } from "@/src/domains/shift/constants";
import type { PositionSegment, ShiftData } from "@/src/domains/shift/types";
import { findBreakEditorError, getBreakEditorRange } from "./BreakEditorDialog";

const INVALID_TIME_ERROR = "休憩の終了時間は開始時間より後にしてください";
const OVERLAP_ERROR = "休憩の時間帯が重なっています";
const OUT_OF_WORK_ERROR = "休憩は勤務時間内にしてください";
const WHOLE_WORK_ERROR = "休憩は勤務時間の一部にしてください";

const segment = (start: string, end: string, overrides: Partial<PositionSegment> = {}): PositionSegment => ({
  id: `seg-${start}-${end}`,
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  start,
  end,
  ...overrides,
});

const row = (start: string, end: string) => ({ start, end });

const singleWork = { positions: [segment("10:00", "18:00")] };
const splitWork = { positions: [segment("10:00", "13:00"), segment("15:00", "18:00")] };

describe("getBreakEditorRange", () => {
  it("時刻を持つ勤務は、勤務の開始から終了までを範囲にする", () => {
    expect(getBreakEditorRange(singleWork, false)).toEqual({ startMinutes: 600, endMinutes: 1080 });
  });

  it("勤務が複数ある日は、最初の開始から最後の終了までを範囲にする", () => {
    expect(getBreakEditorRange({ positions: [segment("15:00", "18:00"), segment("09:30", "13:00")] }, false)).toEqual({
      startMinutes: 570,
      endMinutes: 1080,
    });
  });

  it("休憩のポジションの区間は範囲に含めない", () => {
    expect(
      getBreakEditorRange(
        { positions: [segment("08:00", "10:00", { positionId: BREAK_POSITION.id }), segment("10:00", "18:00")] },
        false,
      ),
    ).toEqual({ startMinutes: 600, endMinutes: 1080 });
  });

  it("日付選択は、勤務の時刻にかかわらず1日のどこでも入れられる", () => {
    expect(getBreakEditorRange({ positions: [segment("09:00", "22:00")] }, true)).toEqual({
      startMinutes: 0,
      endMinutes: 1440,
    });
  });

  it.each([false, true])("勤務のない日は範囲を返さない（日付選択: %s）", (isDateOnly) => {
    expect(getBreakEditorRange({ positions: [] }, isDateOnly)).toBeNull();
    expect(
      getBreakEditorRange({ positions: [segment("12:00", "13:00", { positionId: BREAK_POSITION.id })] }, isDateOnly),
    ).toBeNull();
  });
});

describe("findBreakEditorError", () => {
  describe("時刻を持つ勤務（時間指定・パターン選択）", () => {
    it("勤務の内側にある休憩は通す", () => {
      expect(findBreakEditorError([row("12:00", "13:00"), row("15:00", "15:15")], singleWork, false)).toBeNull();
    });

    it("休憩が1件もなければ通す", () => {
      expect(findBreakEditorError([], singleWork, false)).toBeNull();
    });

    it("勤務の端に接する休憩は通す", () => {
      expect(findBreakEditorError([row("10:00", "10:30"), row("17:30", "18:00")], singleWork, false)).toBeNull();
    });

    it("隣り合う休憩は重なりにしない", () => {
      expect(findBreakEditorError([row("12:00", "12:30"), row("12:30", "13:00")], singleWork, false)).toBeNull();
    });

    it("開始と終了が同じ休憩と、開始が終了より後の休憩を止める", () => {
      expect(findBreakEditorError([row("12:00", "12:00")], singleWork, false)).toBe(INVALID_TIME_ERROR);
      expect(findBreakEditorError([row("13:00", "12:00")], singleWork, false)).toBe(INVALID_TIME_ERROR);
    });

    it("時刻が入っていない休憩を止める", () => {
      expect(findBreakEditorError([row("", "13:00")], singleWork, false)).toBe(INVALID_TIME_ERROR);
      expect(findBreakEditorError([row("12:00", "")], singleWork, false)).toBe(INVALID_TIME_ERROR);
    });

    it("重なる休憩を、入力の順番にかかわらず止める", () => {
      expect(findBreakEditorError([row("12:30", "13:30"), row("12:00", "13:00")], singleWork, false)).toBe(
        OVERLAP_ERROR,
      );
    });

    it("勤務の外にはみ出す休憩を止める", () => {
      expect(findBreakEditorError([row("09:30", "10:30")], singleWork, false)).toBe(OUT_OF_WORK_ERROR);
      expect(findBreakEditorError([row("17:30", "18:30")], singleWork, false)).toBe(OUT_OF_WORK_ERROR);
      expect(findBreakEditorError([row("19:00", "20:00")], singleWork, false)).toBe(OUT_OF_WORK_ERROR);
    });

    it("勤務全体と同じ休憩を止める", () => {
      expect(findBreakEditorError([row("10:00", "18:00")], singleWork, false)).toBe(WHOLE_WORK_ERROR);
    });

    it("ポジションの違う勤務が隣り合う日は、片方の勤務をまるごと覆う休憩を止める", () => {
      const adjacentWork: Pick<ShiftData, "positions"> = {
        positions: [
          { id: "seg-1", positionId: "hall", positionName: "ホール", color: "#111", start: "10:00", end: "14:00" },
          { id: "seg-2", positionId: "kitchen", positionName: "キッチン", color: "#222", start: "14:00", end: "18:00" },
        ],
      };
      expect(findBreakEditorError([row("14:00", "18:00")], adjacentWork, false)).toBe(WHOLE_WORK_ERROR);
      expect(findBreakEditorError([row("13:00", "18:00")], adjacentWork, false)).toBe(WHOLE_WORK_ERROR);
      expect(findBreakEditorError([row("13:30", "14:30")], adjacentWork, false)).toBeNull();
    });

    it("勤務と勤務の隙間にかかる休憩を止める", () => {
      expect(findBreakEditorError([row("13:00", "15:00")], splitWork, false)).toBe(OUT_OF_WORK_ERROR);
      expect(findBreakEditorError([row("12:00", "16:00")], splitWork, false)).toBe(OUT_OF_WORK_ERROR);
    });

    it("勤務が複数ある日は、それぞれの勤務の内側の休憩を通す", () => {
      expect(findBreakEditorError([row("11:00", "11:30"), row("16:00", "16:30")], splitWork, false)).toBeNull();
    });

    it("複数ある勤務のうち1つとちょうど同じ休憩を止める", () => {
      expect(findBreakEditorError([row("10:00", "13:00")], splitWork, false)).toBe(WHOLE_WORK_ERROR);
    });

    it("1件でも勤務の外にあれば止める", () => {
      expect(findBreakEditorError([row("12:00", "13:00"), row("18:00", "18:30")], singleWork, false)).toBe(
        OUT_OF_WORK_ERROR,
      );
    });

    it("ポジションの違う勤務が隣り合う日は、境目をまたぐ休憩も勤務の内側として通す", () => {
      // 10:00〜14:00がホール、14:00〜18:00がキッチンの日。13:30〜14:30は勤務時間の内側にある。
      // 保存と集計（getEffectiveBreaks、buildAssignments）は、この休憩を境目で分けて扱う。
      const adjacentWork = {
        positions: [segment("10:00", "14:00"), segment("14:00", "18:00", { positionId: "pos2" })],
      };

      expect(findBreakEditorError([row("13:30", "14:30")], adjacentWork, false)).toBeNull();
    });
  });

  describe("日付選択", () => {
    const dateOnlyWork = { positions: [segment("09:00", "22:00")] };

    it("勤務の時刻の外にある休憩も通す", () => {
      expect(findBreakEditorError([row("07:00", "08:00"), row("22:30", "23:00")], dateOnlyWork, true)).toBeNull();
    });

    it("勤務の時刻と同じ長さの休憩も通す", () => {
      expect(findBreakEditorError([row("09:00", "22:00")], dateOnlyWork, true)).toBeNull();
    });

    it("開始が終了以降の休憩を止める", () => {
      expect(findBreakEditorError([row("12:00", "12:00")], dateOnlyWork, true)).toBe(INVALID_TIME_ERROR);
      expect(findBreakEditorError([row("13:00", "12:00")], dateOnlyWork, true)).toBe(INVALID_TIME_ERROR);
    });

    it("重なる休憩を止める", () => {
      expect(findBreakEditorError([row("12:00", "13:00"), row("12:45", "13:15")], dateOnlyWork, true)).toBe(
        OVERLAP_ERROR,
      );
    });
  });
});

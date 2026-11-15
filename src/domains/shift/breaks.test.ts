import { describe, expect, it } from "vitest";
import {
  buildInitialBreak,
  getBreaksForSegment,
  getEffectiveBreaks,
  getWorkedMinutes,
  mergeBreaks,
  withInitialBreak,
} from "./breaks";
import { BREAK_POSITION } from "./constants";
import type { PositionSegment, ShiftBreakRule, ShiftData } from "./types";

const segment = (start: string, end: string, overrides: Partial<PositionSegment> = {}): PositionSegment => ({
  id: `seg-${start}-${end}`,
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  start,
  end,
  ...overrides,
});

const range = (start: string, end: string) => ({ start, end });

const day = (positions: PositionSegment[], breaks?: ShiftData["breaks"]): Pick<ShiftData, "positions" | "breaks"> => ({
  positions,
  ...(breaks ? { breaks } : {}),
});

describe("mergeBreaks", () => {
  it("重なる休憩を1件にまとめる", () => {
    expect(mergeBreaks([range("12:00", "13:00"), range("12:30", "13:30")])).toEqual([range("12:00", "13:30")]);
  });

  it("隣り合う休憩を1件にまとめる", () => {
    expect(mergeBreaks([range("12:00", "12:30"), range("12:30", "13:00")])).toEqual([range("12:00", "13:00")]);
  });

  it("別の休憩に含まれる休憩は、外側の休憩にまとめる", () => {
    expect(mergeBreaks([range("12:00", "14:00"), range("12:30", "13:00")])).toEqual([range("12:00", "14:00")]);
  });

  it("間が空いている休憩はまとめず、開始順に並べる", () => {
    expect(mergeBreaks([range("15:00", "15:15"), range("12:00", "13:00"), range("13:15", "13:30")])).toEqual([
      range("12:00", "13:00"),
      range("13:15", "13:30"),
      range("15:00", "15:15"),
    ]);
  });

  it("開始と終了が同じ休憩と、開始が終了より後の休憩は捨てる", () => {
    expect(mergeBreaks([range("12:00", "12:00"), range("14:00", "13:00"), range("15:00", "15:30")])).toEqual([
      range("15:00", "15:30"),
    ]);
  });

  it("休憩がなければ空を返す", () => {
    expect(mergeBreaks([])).toEqual([]);
  });
});

describe("getBreaksForSegment", () => {
  const work = segment("10:00", "18:00");

  it("区間の内側にある休憩はそのまま返す", () => {
    expect(getBreaksForSegment(work, [range("12:00", "13:00")])).toEqual([range("12:00", "13:00")]);
  });

  it("区間の開始より前にはみ出す休憩は、区間の開始で切り詰める", () => {
    expect(getBreaksForSegment(work, [range("09:00", "11:00")])).toEqual([range("10:00", "11:00")]);
  });

  it("区間の終了より後にはみ出す休憩は、区間の終了で切り詰める", () => {
    expect(getBreaksForSegment(work, [range("17:00", "19:00")])).toEqual([range("17:00", "18:00")]);
  });

  it("区間の端に接する休憩は残す", () => {
    expect(getBreaksForSegment(work, [range("10:00", "10:30"), range("17:30", "18:00")])).toEqual([
      range("10:00", "10:30"),
      range("17:30", "18:00"),
    ]);
  });

  it("区間とちょうど同じ休憩と、区間を外から覆う休憩は除く", () => {
    expect(getBreaksForSegment(work, [range("10:00", "18:00")])).toEqual([]);
    expect(getBreaksForSegment(work, [range("09:00", "19:00")])).toEqual([]);
  });

  it("区間の外にある休憩は、区間の境目に接していても除く", () => {
    expect(getBreaksForSegment(work, [range("08:00", "10:00"), range("18:00", "19:00")])).toEqual([]);
  });

  it("重なる休憩はまとめてから切り詰める", () => {
    expect(getBreaksForSegment(work, [range("12:30", "13:30"), range("12:00", "13:00")])).toEqual([
      range("12:00", "13:30"),
    ]);
  });
});

describe("getEffectiveBreaks", () => {
  describe("勤務時間の内側へ切り詰める場合（時間指定・パターン選択）", () => {
    const options = { clipToWork: true };

    it("勤務の外にはみ出した部分を除く", () => {
      expect(
        getEffectiveBreaks(
          day([segment("10:00", "14:00")], [range("13:00", "15:00"), range("16:00", "17:00")]),
          options,
        ),
      ).toEqual([range("13:00", "14:00")]);
    });

    it("隣り合う区間をまたぐ休憩は、境目で分かれたあと1件にまとまる", () => {
      expect(
        getEffectiveBreaks(
          day(
            [segment("10:00", "14:00"), segment("14:00", "18:00", { positionId: "pos2" })],
            [range("13:30", "14:30")],
          ),
          options,
        ),
      ).toEqual([range("13:30", "14:30")]);
    });

    it("勤務の隙間をまたぐ休憩は、隙間の部分を除いて区間ごとに分かれる", () => {
      expect(
        getEffectiveBreaks(
          day([segment("10:00", "13:00"), segment("15:00", "18:00")], [range("12:00", "16:00")]),
          options,
        ),
      ).toEqual([range("12:00", "13:00"), range("15:00", "16:00")]);
    });

    it("休憩のポジションだけの日は勤務のない日として扱う", () => {
      expect(
        getEffectiveBreaks(
          day([segment("12:00", "13:00", { positionId: BREAK_POSITION.id })], [range("12:00", "12:30")]),
          options,
        ),
      ).toEqual([]);
    });
  });

  describe("入力のまま返す場合（日付選択）", () => {
    const options = { clipToWork: false };

    it("勤務の時刻の外にある休憩も残す", () => {
      expect(
        getEffectiveBreaks(
          day([segment("09:00", "22:00")], [range("23:00", "23:30"), range("12:00", "13:00")]),
          options,
        ),
      ).toEqual([range("12:00", "13:00"), range("23:00", "23:30")]);
    });

    it("勤務全体と同じ長さの休憩も残す", () => {
      expect(getEffectiveBreaks(day([segment("09:00", "22:00")], [range("09:00", "22:00")]), options)).toEqual([
        range("09:00", "22:00"),
      ]);
    });
  });

  it.each([true, false])("勤務のない日は休憩があっても空を返す（clipToWork: %s）", (clipToWork) => {
    expect(getEffectiveBreaks(day([], [range("12:00", "13:00")]), { clipToWork })).toEqual([]);
  });

  it.each([true, false])("休憩のない日は空を返す（clipToWork: %s）", (clipToWork) => {
    expect(getEffectiveBreaks(day([segment("10:00", "18:00")]), { clipToWork })).toEqual([]);
    expect(getEffectiveBreaks({ positions: [segment("10:00", "18:00")], breaks: [] }, { clipToWork })).toEqual([]);
  });
});

describe("getWorkedMinutes", () => {
  it("休憩がなければ勤務の長さを返す", () => {
    expect(getWorkedMinutes(day([segment("10:00", "18:00")]))).toBe(480);
  });

  it("勤務の中の休憩を引く", () => {
    expect(getWorkedMinutes(day([segment("10:00", "18:00")], [range("12:00", "13:00"), range("15:00", "15:15")]))).toBe(
      405,
    );
  });

  it("勤務の外にある休憩は引かない", () => {
    expect(getWorkedMinutes(day([segment("10:00", "18:00")], [range("19:00", "20:00")]))).toBe(480);
  });

  it("勤務からはみ出した休憩は、勤務の中の部分だけを引く", () => {
    expect(getWorkedMinutes(day([segment("10:00", "18:00")], [range("17:30", "19:00")]))).toBe(450);
  });

  it("重なる休憩を二重に引かない", () => {
    expect(getWorkedMinutes(day([segment("10:00", "18:00")], [range("12:00", "13:00"), range("12:30", "13:30")]))).toBe(
      390,
    );
  });

  it("重なる勤務区間を二重に数えない", () => {
    expect(getWorkedMinutes(day([segment("10:00", "14:00"), segment("13:00", "18:00", { positionId: "pos2" })]))).toBe(
      480,
    );
  });

  it("重なる勤務区間の重なりにある休憩も一度だけ引く", () => {
    expect(
      getWorkedMinutes(
        day([segment("10:00", "14:00"), segment("13:00", "18:00", { positionId: "pos2" })], [range("13:15", "13:45")]),
      ),
    ).toBe(450);
  });

  it("勤務と勤務の隙間（中抜け）は数えない", () => {
    expect(getWorkedMinutes(day([segment("10:00", "13:00"), segment("15:00", "18:00")]))).toBe(360);
  });

  it("隙間をまたぐ休憩は、勤務の中の部分だけを引く", () => {
    expect(
      getWorkedMinutes(day([segment("10:00", "13:00"), segment("15:00", "18:00")], [range("12:00", "16:00")])),
    ).toBe(240);
  });

  it("休憩のポジションの区間は勤務として数えない", () => {
    expect(
      getWorkedMinutes(
        day([
          segment("10:00", "12:00"),
          segment("12:00", "13:00", { positionId: BREAK_POSITION.id }),
          segment("13:00", "18:00"),
        ]),
      ),
    ).toBe(420);
  });

  it("勤務のない日は0を返す", () => {
    expect(getWorkedMinutes(day([], [range("12:00", "13:00")]))).toBe(0);
  });
});

describe("buildInitialBreak", () => {
  const rule: ShiftBreakRule = { minWorkMinutes: 360, breakMinutes: 60 };

  it.each([null, undefined])("休憩の決まりがなければ入れない（%s）", (noRule) => {
    expect(buildInitialBreak(segment("09:00", "22:00"), noRule)).toBeNull();
  });

  it("決まりの長さに届かない勤務には入れない", () => {
    expect(buildInitialBreak(segment("10:00", "15:30"), rule)).toBeNull();
  });

  it("決まりの長さちょうどの勤務には、中央へ入れる", () => {
    expect(buildInitialBreak(segment("10:00", "16:00"), rule)).toEqual(range("12:30", "13:30"));
  });

  it("決まりの長さを超える勤務にも、中央へ入れる", () => {
    expect(buildInitialBreak(segment("09:00", "18:00"), rule)).toEqual(range("13:00", "14:00"));
  });

  it("中央が15分単位にならない場合は、15分単位へそろえる", () => {
    // 09:10〜17:10の中央に60分を置くと12:40開始になる。15分単位で最も近い12:45へそろえる。
    expect(buildInitialBreak(segment("09:10", "17:10"), rule)).toEqual(range("12:45", "13:45"));
  });

  it("休憩の長さが勤務の長さ以上になる決まりでは入れない", () => {
    expect(buildInitialBreak(segment("10:00", "11:00"), { minWorkMinutes: 60, breakMinutes: 60 })).toBeNull();
    expect(buildInitialBreak(segment("10:00", "11:00"), { minWorkMinutes: 30, breakMinutes: 90 })).toBeNull();
  });

  it("15分単位へそろえると勤務の終了を超える場合は、勤務の終了に合わせる", () => {
    expect(buildInitialBreak(segment("10:05", "11:00"), { minWorkMinutes: 30, breakMinutes: 50 })).toEqual(
      range("10:10", "11:00"),
    );
  });

  it("15分単位へそろえると勤務の開始より前になる場合は、勤務の開始に合わせる", () => {
    expect(buildInitialBreak(segment("10:05", "11:05"), { minWorkMinutes: 60, breakMinutes: 58 })).toEqual(
      range("10:05", "11:03"),
    );
  });

  it("24時を超える勤務でも中央へ入れる", () => {
    expect(buildInitialBreak(segment("20:00", "28:00"), rule)).toEqual(range("23:30", "24:30"));
  });
});

describe("withInitialBreak", () => {
  const rule: ShiftBreakRule = { minWorkMinutes: 360, breakMinutes: 60 };

  it("決まりの長さ以上の勤務がある日に休憩を入れ、ほかの項目は変えない", () => {
    const shift = { id: "shift-1", positions: [segment("10:00", "18:00")] };
    expect(withInitialBreak(shift, rule)).toEqual({
      id: "shift-1",
      positions: [segment("10:00", "18:00")],
      breaks: [range("13:30", "14:30")],
    });
  });

  it("休憩が空の配列で入っている日にも入れる", () => {
    expect(withInitialBreak({ positions: [segment("10:00", "18:00")], breaks: [] }, rule).breaks).toEqual([
      range("13:30", "14:30"),
    ]);
  });

  it.each([null, undefined])("休憩の決まりがなければ変えない（%s）", (noRule) => {
    const shift = day([segment("10:00", "18:00")]);
    expect(withInitialBreak(shift, noRule)).toBe(shift);
  });

  it("すでに休憩がある日は変えない", () => {
    const shift = day([segment("10:00", "18:00")], [range("11:00", "11:15")]);
    expect(withInitialBreak(shift, rule)).toBe(shift);
  });

  it("決まりの長さに届かない日は変えない", () => {
    const shift = day([segment("10:00", "15:00")]);
    expect(withInitialBreak(shift, rule)).toBe(shift);
  });

  it("勤務のない日と、休憩のポジションだけの日は変えない", () => {
    const empty = day([]);
    const breakOnly = day([segment("09:00", "18:00", { positionId: BREAK_POSITION.id })]);
    expect(withInitialBreak(empty, rule)).toBe(empty);
    expect(withInitialBreak(breakOnly, rule)).toBe(breakOnly);
  });

  it("勤務が複数ある日は、最も長い区間の中央へ入れる", () => {
    const shift = day([segment("09:00", "11:00"), segment("12:00", "19:00")]);
    expect(withInitialBreak(shift, rule).breaks).toEqual([range("15:00", "16:00")]);
  });

  it("最も長い区間が決まりの長さに届かなければ、合計が届いていても入れない", () => {
    const shift = day([segment("09:00", "13:00"), segment("14:00", "18:00")]);
    expect(withInitialBreak(shift, rule)).toBe(shift);
  });
});

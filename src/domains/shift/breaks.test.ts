import { describe, expect, it } from "vitest";
import {
  applyBreakRange,
  buildInitialBreak,
  getBreaksForSegment,
  getEffectiveBreaks,
  getWorkedMinutes,
  mergeBreaks,
  moveBreakEdge,
  pruneBreaks,
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

    it("勤務の開始より後、終了より前にある休憩を返し、勤務の外にある休憩を除く", () => {
      expect(
        getEffectiveBreaks(
          day([segment("10:00", "14:00")], [range("10:15", "10:30"), range("13:30", "13:45"), range("16:00", "17:00")]),
          options,
        ),
      ).toEqual([range("10:15", "10:30"), range("13:30", "13:45")]);
    });

    it.each([
      { name: "勤務の開始に接する休憩", breaks: [range("10:00", "10:45")] },
      { name: "勤務の終了に接する休憩", breaks: [range("13:00", "14:00")] },
      { name: "勤務の開始より前からはみ出す休憩", breaks: [range("09:30", "10:30")] },
      { name: "勤務の終了より後へはみ出す休憩", breaks: [range("13:00", "15:00")] },
    ])("$name は、勤務ではないため休憩として残さない", ({ breaks }) => {
      expect(getEffectiveBreaks(day([segment("10:00", "14:00")], breaks), options)).toEqual([]);
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

    it("勤務の隙間をまたぐ休憩は、それぞれの勤務の頭かお尻に接するため残さない", () => {
      expect(
        getEffectiveBreaks(
          day([segment("10:00", "13:00"), segment("15:00", "18:00")], [range("12:00", "16:00")]),
          options,
        ),
      ).toEqual([]);
    });

    it("勤務が複数ある日は、それぞれの勤務の途中にある休憩を残す", () => {
      expect(
        getEffectiveBreaks(
          day(
            [segment("10:00", "13:00"), segment("15:00", "18:00")],
            [range("11:00", "11:30"), range("16:00", "16:30")],
          ),
          options,
        ),
      ).toEqual([range("11:00", "11:30"), range("16:00", "16:30")]);
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

describe("applyBreakRange", () => {
  const hall = segment("09:00", "18:00");

  it("勤務の途中の範囲を休憩として足し、勤務は変えない", () => {
    expect(applyBreakRange(day([hall]), range("12:00", "12:45"))).toEqual({
      positions: [hall],
      breaks: [range("12:00", "12:45")],
    });
  });

  it("すでにある休憩と重なる範囲、隣り合う範囲は、1件にまとめる", () => {
    const shift = day([hall], [range("12:00", "13:00"), range("15:00", "15:15")]);

    expect(applyBreakRange(shift, range("12:30", "13:30"))?.breaks).toEqual([
      range("12:00", "13:30"),
      range("15:00", "15:15"),
    ]);
    expect(applyBreakRange(shift, range("13:00", "13:15"))?.breaks).toEqual([
      range("12:00", "13:15"),
      range("15:00", "15:15"),
    ]);
  });

  it("勤務の頭をなぞると、休憩を残さず、勤務の開始をなぞった終わりまで遅らせる", () => {
    expect(applyBreakRange(day([segment("11:00", "15:30")]), range("11:00", "11:45"))).toEqual({
      positions: [segment("11:00", "15:30", { start: "11:45" })],
      breaks: [],
    });
  });

  it("勤務のお尻をなぞると、休憩を残さず、勤務の終了をなぞった始まりまで早める", () => {
    expect(applyBreakRange(day([segment("11:00", "15:30")]), range("14:30", "15:30"))).toEqual({
      positions: [segment("11:00", "15:30", { end: "14:30" })],
      breaks: [],
    });
  });

  it("勤務の外からはみ出してなぞった場合も、勤務にかかる部分だけ勤務を短くする", () => {
    expect(applyBreakRange(day([segment("09:00", "13:00")]), range("12:30", "14:00"))).toEqual({
      positions: [segment("09:00", "13:00", { end: "12:30" })],
      breaks: [],
    });
  });

  it("頭をなぞった範囲がすでにある休憩につながる場合は、その休憩の終わりまで勤務を短くする", () => {
    const shift = day([segment("11:00", "15:30")], [range("11:30", "12:00"), range("13:00", "13:30")]);

    expect(applyBreakRange(shift, range("11:00", "11:30"))).toEqual({
      positions: [segment("11:00", "15:30", { start: "12:00" })],
      breaks: [range("13:00", "13:30")],
    });
  });

  it("ポジションの違う隣り合う勤務は、境目をまたいで休憩を入れられ、勤務は変えない", () => {
    const positions = [segment("09:00", "12:00"), segment("12:00", "18:00", { positionId: "pos2" })];

    expect(applyBreakRange(day(positions), range("11:30", "12:30"))).toEqual({
      positions,
      breaks: [range("11:30", "12:30")],
    });
  });

  it("ポジションの違う隣り合う勤務の頭を、最初の勤務を越えてなぞると、最初の勤務を外して次の勤務を短くする", () => {
    const kitchen = segment("12:00", "18:00", { positionId: "pos2" });

    expect(applyBreakRange(day([segment("09:00", "12:00"), kitchen]), range("09:00", "12:30"))).toEqual({
      positions: [{ ...kitchen, start: "12:30" }],
      breaks: [],
    });
  });

  it("勤務が複数ある日は、なぞった勤務だけを短くする", () => {
    const morning = segment("09:00", "12:00");
    const evening = segment("15:00", "20:00");

    expect(applyBreakRange(day([morning, evening]), range("11:30", "12:00"))).toEqual({
      positions: [{ ...morning, end: "11:30" }, evening],
      breaks: [],
    });
  });

  it("休憩のポジションの区間は変えずに残す", () => {
    const legacyBreak = segment("12:00", "13:00", { positionId: BREAK_POSITION.id });
    const afternoon = segment("13:00", "18:00");

    expect(applyBreakRange(day([legacyBreak, afternoon]), range("13:00", "13:30"))).toEqual({
      positions: [legacyBreak, { ...afternoon, start: "13:30" }],
      breaks: [],
    });
  });

  it("勤務の外だけの範囲と、すでに休憩の時間だけの範囲は、何も変えない（null）", () => {
    const shift = day([segment("09:00", "13:00")], [range("11:00", "12:00")]);

    expect(applyBreakRange(shift, range("14:00", "15:00"))).toBeNull();
    expect(applyBreakRange(shift, range("11:15", "11:45"))).toBeNull();
  });

  it("ひと続きの勤務をまるごと覆う範囲と、勤務が残らなくなる範囲は、何も変えない（null）", () => {
    expect(applyBreakRange(day([segment("09:00", "13:00")]), range("09:00", "13:00"))).toBeNull();
    expect(applyBreakRange(day([segment("09:00", "13:00")]), range("08:00", "14:00"))).toBeNull();
    // 09:15〜12:45が休憩の勤務で、残りの頭をなぞると、頭からお尻の手前までが休憩になり、お尻もなぞると勤務が残らない。
    const mostlyBreak = day([segment("09:00", "13:00")], [range("09:15", "12:45")]);
    expect(applyBreakRange(mostlyBreak, range("09:00", "09:15"))).toEqual({
      positions: [segment("09:00", "13:00", { start: "12:45" })],
      breaks: [],
    });
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

  it("勤務の頭かお尻に接する休憩と、勤務からはみ出した休憩は引かない", () => {
    expect(getWorkedMinutes(day([segment("10:00", "18:00")], [range("10:00", "10:30")]))).toBe(480);
    expect(getWorkedMinutes(day([segment("10:00", "18:00")], [range("17:30", "19:00")]))).toBe(480);
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

  it("隙間をまたぐ休憩は、それぞれの勤務の頭かお尻に接するため引かない", () => {
    expect(
      getWorkedMinutes(day([segment("10:00", "13:00"), segment("15:00", "18:00")], [range("12:00", "16:00")])),
    ).toBe(360);
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

  it("休憩の前後に勤務が残る最も短い勤務には、開始の15分後から入れる", () => {
    // 60分の休憩の前後に15分ずつ勤務が残る、90分の勤務。
    expect(buildInitialBreak(segment("10:00", "11:30"), { minWorkMinutes: 60, breakMinutes: 60 })).toEqual(
      range("10:15", "11:15"),
    );
  });

  it("休憩を勤務の開始より後、終了より前に置けない勤務には入れない", () => {
    // 60分の休憩を15分単位で置くと、開始か終了のどちらかに接する。
    expect(buildInitialBreak(segment("10:00", "11:15"), { minWorkMinutes: 60, breakMinutes: 60 })).toBeNull();
    expect(buildInitialBreak(segment("10:05", "11:00"), { minWorkMinutes: 30, breakMinutes: 50 })).toBeNull();
  });

  it("15分単位にそろっていない勤務でも、開始より後、終了より前に入れる", () => {
    // 10:05〜11:40の中央に60分を置くと10:22開始になる。15分単位で最も近い10:30〜11:30は、前後に勤務が残る。
    expect(buildInitialBreak(segment("10:05", "11:40"), { minWorkMinutes: 60, breakMinutes: 60 })).toEqual(
      range("10:30", "11:30"),
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

describe("pruneBreaks", () => {
  it("勤務の外に出た休憩と、勤務の頭かお尻にかかった休憩を取り除き、内側の休憩は残す", () => {
    const shift = day(
      [segment("12:00", "18:00")],
      [range("10:00", "11:00"), range("11:30", "12:30"), range("15:00", "16:00"), range("17:30", "18:00")],
    );

    expect(pruneBreaks(shift)).toEqual(day([segment("12:00", "18:00")], [range("15:00", "16:00")]));
  });

  it("残る休憩がなければ、休憩の項目ごと取り除く", () => {
    const shift = day([segment("12:00", "18:00")], [range("10:00", "11:00")]);

    expect(pruneBreaks(shift)).toEqual(day([segment("12:00", "18:00")]));
    expect(pruneBreaks(shift)).not.toHaveProperty("breaks");
  });

  it("取り除くものがなければ、そのまま返す", () => {
    const withBreak = day([segment("10:00", "18:00")], [range("12:00", "13:00")]);
    const withoutBreak = day([segment("10:00", "18:00")]);

    expect(pruneBreaks(withBreak)).toBe(withBreak);
    expect(pruneBreaks(withoutBreak)).toBe(withoutBreak);
  });
});

describe("moveBreakEdge", () => {
  const minutes = (start: string, end: string) => {
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    return { start: toMinutes(start), end: toMinutes(end) };
  };
  const shift = day([segment("10:00", "18:00")], [range("12:00", "13:00"), range("15:00", "15:30")]);

  it("休憩の終了を動かす", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "end", 13 * 60 + 45)).toEqual([
      range("12:00", "13:45"),
      range("15:00", "15:30"),
    ]);
  });

  it("休憩の開始を動かす", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "start", 11 * 60 + 15)).toEqual([
      range("11:15", "13:00"),
      range("15:00", "15:30"),
    ]);
  });

  it("15分の長さまでは縮められる", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "end", 12 * 60 + 15)).toEqual([
      range("12:00", "12:15"),
      range("15:00", "15:30"),
    ]);
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "start", 12 * 60 + 45)).toEqual([
      range("12:45", "13:00"),
      range("15:00", "15:30"),
    ]);
  });

  it("反対の端まで、またはそれを越えて動かすと、その休憩だけを削除する", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "end", 12 * 60)).toEqual([range("15:00", "15:30")]);
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "end", 11 * 60)).toEqual([range("15:00", "15:30")]);
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "start", 13 * 60)).toEqual([range("15:00", "15:30")]);
    expect(moveBreakEdge(shift, minutes("15:00", "15:30"), "start", 16 * 60)).toEqual([range("12:00", "13:00")]);
  });

  it("休憩が1件だけの日で削除すると、休憩がなくなる", () => {
    const single = day([segment("10:00", "18:00")], [range("12:00", "13:00")]);

    expect(moveBreakEdge(single, minutes("12:00", "13:00"), "end", 12 * 60)).toEqual([]);
  });

  it("動かす端は、勤務の開始より後、終了より前に収める", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "start", 9 * 60)).toEqual([
      range("10:15", "13:00"),
      range("15:00", "15:30"),
    ]);
    expect(moveBreakEdge(shift, minutes("15:00", "15:30"), "end", 19 * 60)).toEqual([
      range("12:00", "13:00"),
      range("15:00", "17:45"),
    ]);
  });

  it("ほかの休憩と重なるまで動かすと、1件にまとめる", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "end", 15 * 60 + 15)).toEqual([range("12:00", "15:30")]);
  });

  it("動かしていない場合と、対象の休憩がない場合はnullを返す", () => {
    expect(moveBreakEdge(shift, minutes("12:00", "13:00"), "end", 13 * 60)).toBeNull();
    expect(moveBreakEdge(shift, minutes("11:00", "11:30"), "end", 12 * 60)).toBeNull();
  });

  it("動かした結果、ポジションの区間をまるごと覆う場合は、変えない", () => {
    const twoPositions = day(
      [segment("10:00", "12:00"), segment("12:00", "13:00", { positionId: "pos2" }), segment("13:00", "18:00")],
      [range("12:00", "12:30")],
    );

    expect(moveBreakEdge(twoPositions, minutes("12:00", "12:30"), "end", 13 * 60)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  addStaffingBar,
  addStaffingBars,
  alignStaffingBarRange,
  countBarsOutsideRange,
  countRequiredSegments,
  DEFAULT_STAFFING_BAR_LIMITS,
  type EditableStaffingBar,
  getPeakStaffingBarCount,
  groupStaffingBars,
  packStaffingBars,
  removeStaffingBar,
  removeStaffingBars,
  resizeStaffingBar,
  type StaffingBarRules,
  setStaffingBarGroup,
  toEditableStaffingBars,
  toStoredStaffingBars,
  trimBarsToRange,
  updateStaffingBar,
} from "./staffingBars";
import type { StaffingBar } from "./types";

const HALL = "hall";
const KITCHEN = "kitchen";

// 受付時間 9:00〜22:00、30分刻み。
const rules: StaffingBarRules = {
  range: { startMinutes: 9 * 60, endMinutes: 22 * 60 },
  unitMinutes: 30,
  limits: DEFAULT_STAFFING_BAR_LIMITS,
};

const bar = (id: string, start: string, end: string, positionId: string = HALL): EditableStaffingBar => ({
  id,
  positionId,
  start,
  end,
});

const stored = (start: string, end: string, positionId: string = HALL): StaffingBar => ({ positionId, start, end });

/** 行ごとのバーを「開始-終了」の文字列へ直す。行への詰め方を読みやすく比べるために使う。 */
const rowLabels = (rows: StaffingBar[][]) => rows.map((row) => row.map((item) => `${item.start}-${item.end}`));

describe("toEditableStaffingBars / toStoredStaffingBars", () => {
  it("保存済みのバーへ、並び順のidを振る", () => {
    expect(toEditableStaffingBars([stored("09:00", "22:00"), stored("11:00", "14:00", KITCHEN)])).toEqual([
      { id: "bar-1", positionId: HALL, start: "09:00", end: "22:00" },
      { id: "bar-2", positionId: KITCHEN, start: "11:00", end: "14:00" },
    ]);
  });

  it("保存する形へ戻すと、idだけが外れて並びは変わらない", () => {
    expect(toStoredStaffingBars([bar("bar-7", "11:00", "14:00", KITCHEN), bar("bar-2", "09:00", "22:00")])).toEqual([
      { positionId: KITCHEN, start: "11:00", end: "14:00" },
      { positionId: HALL, start: "09:00", end: "22:00" },
    ]);
  });
});

describe("packStaffingBars", () => {
  it("開始の早い順に、その時間が空いている一番上の行へ置き、最後に空の行を1つ付ける", () => {
    const [hall] = packStaffingBars({
      bars: [
        stored("18:00", "22:00"),
        stored("17:00", "22:00"),
        stored("11:00", "14:00"),
        stored("09:00", "22:00"),
        stored("17:00", "22:00"),
        stored("11:00", "14:00"),
        stored("18:00", "22:00"),
      ],
      positionIds: [HALL],
    });

    expect(rowLabels(hall.rows)).toEqual([
      ["09:00-22:00"],
      ["11:00-14:00", "17:00-22:00"],
      ["11:00-14:00", "17:00-22:00"],
      ["18:00-22:00"],
      ["18:00-22:00"],
      [],
    ]);
  });

  it("隣り合うバーは同じ行に並べ、1本につなげない", () => {
    const [hall] = packStaffingBars({
      bars: [bar("a", "10:00", "14:00"), bar("b", "14:00", "18:00")],
      positionIds: [HALL],
    });

    expect(hall.rows).toEqual([[bar("a", "10:00", "14:00"), bar("b", "14:00", "18:00")], []]);
  });

  it("30分でも重なるバーは、次の行へ置く", () => {
    const [hall] = packStaffingBars({
      bars: [stored("10:00", "14:00"), stored("13:30", "18:00")],
      positionIds: [HALL],
    });

    expect(rowLabels(hall.rows)).toEqual([["10:00-14:00"], ["13:30-18:00"], []]);
  });

  it("開始が同じバーは、長いバーを上の行へ置く", () => {
    const [hall] = packStaffingBars({
      bars: [stored("10:00", "12:00"), stored("10:00", "18:00"), stored("12:00", "15:00")],
      positionIds: [HALL],
    });

    expect(rowLabels(hall.rows)).toEqual([["10:00-18:00"], ["10:00-12:00", "12:00-15:00"], []]);
  });

  it("途中の行が空いたら、あとのバーをその行へ詰める", () => {
    const [hall] = packStaffingBars({
      bars: [stored("09:00", "12:00"), stored("09:00", "10:00"), stored("10:00", "11:00"), stored("12:00", "13:00")],
      positionIds: [HALL],
    });

    expect(rowLabels(hall.rows)).toEqual([["09:00-12:00", "12:00-13:00"], ["09:00-10:00", "10:00-11:00"], []]);
  });

  it("ポジションごとに分けて詰め、バーのないポジションには空の行だけを出す", () => {
    const result = packStaffingBars({
      bars: [stored("09:00", "12:00", KITCHEN), stored("09:00", "12:00", KITCHEN)],
      positionIds: [HALL, KITCHEN],
    });

    expect(result.map((item) => ({ positionId: item.positionId, rows: rowLabels(item.rows) }))).toEqual([
      { positionId: HALL, rows: [[]] },
      { positionId: KITCHEN, rows: [["09:00-12:00"], ["09:00-12:00"], []] },
    ]);
  });

  it("一覧にないポジションのバーは置かない", () => {
    const result = packStaffingBars({ bars: [stored("09:00", "12:00", "removed")], positionIds: [HALL] });

    expect(result).toEqual([{ positionId: HALL, rows: [[]] }]);
  });
});

describe("addStaffingBar / addStaffingBars", () => {
  it("バーを1本足し、一覧にない次の番号のidを振る", () => {
    const result = addStaffingBar({
      bars: [bar("bar-3", "09:00", "22:00"), bar("bar-1", "11:00", "14:00")],
      bar: stored("17:00", "22:00", KITCHEN),
      rules,
    });

    expect(result).toEqual({
      ok: true,
      bars: [bar("bar-3", "09:00", "22:00"), bar("bar-1", "11:00", "14:00"), bar("bar-4", "17:00", "22:00", KITCHEN)],
    });
  });

  it("同じ時間のバーを、本数分だけ別々のバーとして足す", () => {
    const result = addStaffingBars({ bars: [], bar: stored("11:00", "14:00"), count: 3, rules });

    expect(result).toEqual({
      ok: true,
      bars: [bar("bar-1", "11:00", "14:00"), bar("bar-2", "11:00", "14:00"), bar("bar-3", "11:00", "14:00")],
    });
  });

  it("隣り合うバーを足しても、もとのバーとつなげない", () => {
    const result = addStaffingBar({ bars: [bar("bar-1", "10:00", "14:00")], bar: stored("14:00", "18:00"), rules });

    expect(result).toEqual({ ok: true, bars: [bar("bar-1", "10:00", "14:00"), bar("bar-2", "14:00", "18:00")] });
  });

  it("受付時間の端から端までのバーと、最小の30分のバーは足せる", () => {
    expect(addStaffingBar({ bars: [], bar: stored("09:00", "22:00"), rules }).ok).toBe(true);
    expect(addStaffingBar({ bars: [], bar: stored("21:30", "22:00"), rules }).ok).toBe(true);
  });

  it.each([
    ["長さが0", stored("10:00", "10:00"), "TOO_SHORT"],
    ["終了が開始より前", stored("12:00", "10:00"), "TOO_SHORT"],
    ["長さが刻みに届かない", stored("10:00", "10:15"), "TOO_SHORT"],
    ["開始が刻みに合わない", stored("10:15", "11:00"), "NOT_ON_UNIT"],
    ["終了が刻みに合わない", stored("10:00", "11:15"), "NOT_ON_UNIT"],
    ["開始が受付時間より前", stored("08:30", "10:00"), "OUT_OF_RANGE"],
    ["終了が受付時間より後", stored("21:00", "22:30"), "OUT_OF_RANGE"],
  ] as const)("%sのバーは受け付けない", (_label, input, reason) => {
    expect(addStaffingBar({ bars: [], bar: input, rules })).toEqual({ ok: false, reason });
  });

  it.each([0, -1, 1.5])("本数が%sのときは受け付けない", (count) => {
    expect(addStaffingBars({ bars: [], bar: stored("11:00", "14:00"), count, rules })).toEqual({
      ok: false,
      reason: "INVALID_COUNT",
    });
  });

  describe("同時に重なるバーの上限（1ポジション10本）", () => {
    const nine = Array.from({ length: 9 }, (_, index) => bar(`bar-${index + 1}`, "11:00", "14:00"));

    it("10本目までは足せる", () => {
      const result = addStaffingBar({ bars: nine, bar: stored("13:30", "15:00"), rules });

      expect(result.ok && getPeakStaffingBarCount(result.bars, HALL)).toBe(10);
    });

    it("11本目が重なる操作は受け付けない", () => {
      expect(addStaffingBars({ bars: nine, bar: stored("13:30", "15:00"), count: 2, rules })).toEqual({
        ok: false,
        reason: "TOO_MANY_CONCURRENT",
      });
    });

    it("隣り合うだけのバーは重なりに数えない", () => {
      const ten = [...nine, bar("bar-10", "11:00", "14:00")];

      expect(addStaffingBars({ bars: ten, bar: stored("14:00", "18:00"), count: 10, rules }).ok).toBe(true);
    });

    it("ほかのポジションのバーは重なりに数えない", () => {
      const ten = [...nine, bar("bar-10", "11:00", "14:00")];

      expect(addStaffingBars({ bars: ten, bar: stored("11:00", "14:00", KITCHEN), count: 10, rules }).ok).toBe(true);
    });
  });

  describe("1つの型のバーの上限", () => {
    const smallLimit: StaffingBarRules = { ...rules, limits: { maxConcurrentPerPosition: 10, maxBars: 4 } };
    const three = [bar("bar-1", "09:00", "10:00"), bar("bar-2", "10:00", "11:00"), bar("bar-3", "11:00", "12:00")];

    it("上限ちょうどまでは足せる", () => {
      expect(addStaffingBar({ bars: three, bar: stored("12:00", "13:00"), rules: smallLimit }).ok).toBe(true);
    });

    it("上限を超える本数は、1本も足さずに受け付けない", () => {
      expect(addStaffingBars({ bars: three, bar: stored("12:00", "13:00"), count: 2, rules: smallLimit })).toEqual({
        ok: false,
        reason: "TOO_MANY_BARS",
      });
    });
  });
});

describe("updateStaffingBar", () => {
  const bars = [bar("bar-1", "10:00", "14:00"), bar("bar-2", "14:00", "18:00")];

  it("選んだバーの開始と終了だけを変える", () => {
    expect(updateStaffingBar({ bars, barId: "bar-1", start: "09:00", end: "12:00", rules })).toEqual({
      ok: true,
      bars: [bar("bar-1", "09:00", "12:00"), bar("bar-2", "14:00", "18:00")],
    });
  });

  it("最小の長さに届かない時刻は受け付けない", () => {
    expect(updateStaffingBar({ bars, barId: "bar-1", start: "10:00", end: "10:00", rules })).toEqual({
      ok: false,
      reason: "TOO_SHORT",
    });
  });

  it("受付時間の外へ出る時刻は受け付けない", () => {
    expect(updateStaffingBar({ bars, barId: "bar-2", start: "14:00", end: "22:30", rules })).toEqual({
      ok: false,
      reason: "OUT_OF_RANGE",
    });
  });

  it("対象のバーがなければ受け付けない", () => {
    expect(updateStaffingBar({ bars, barId: "missing", start: "10:00", end: "12:00", rules })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });

  it("伸ばした先で重なりが上限を超える場合は受け付けない", () => {
    const ten = Array.from({ length: 10 }, (_, index) => bar(`bar-${index + 1}`, "11:00", "14:00"));
    const withNeighbor = [...ten, bar("bar-11", "14:00", "18:00")];

    expect(updateStaffingBar({ bars: withNeighbor, barId: "bar-11", start: "13:30", end: "18:00", rules })).toEqual({
      ok: false,
      reason: "TOO_MANY_CONCURRENT",
    });
  });

  it("上限を超えて保存されていたバーでも、縮める操作は受け付ける", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => bar(`bar-${index + 1}`, "11:00", "14:00"));

    expect(updateStaffingBar({ bars: eleven, barId: "bar-1", start: "11:00", end: "13:00", rules }).ok).toBe(true);
  });
});

describe("resizeStaffingBar", () => {
  const bars = [bar("bar-1", "11:00", "14:00")];
  const resize = (edge: "start" | "end", minutes: number) =>
    resizeStaffingBar({ bars, barId: "bar-1", edge, minutes, rules });

  it("終了の端を動かすと、終了だけが変わる", () => {
    expect(resize("end", 16 * 60)).toEqual({ ok: true, bars: [bar("bar-1", "11:00", "16:00")] });
  });

  it("開始の端を動かすと、開始だけが変わる", () => {
    expect(resize("start", 9 * 60 + 30)).toEqual({ ok: true, bars: [bar("bar-1", "09:30", "14:00")] });
  });

  it("動かした先を30分へ寄せる", () => {
    expect(resize("end", 15 * 60 + 10)).toEqual({ ok: true, bars: [bar("bar-1", "11:00", "15:00")] });
    expect(resize("end", 15 * 60 + 20)).toEqual({ ok: true, bars: [bar("bar-1", "11:00", "15:30")] });
  });

  it("終了を開始と同じ位置まで縮めても、バーは消えず30分で残る", () => {
    expect(resize("end", 11 * 60)).toEqual({ ok: true, bars: [bar("bar-1", "11:00", "11:30")] });
  });

  it("終了を開始より前まで動かしても、バーは消えず30分で残る", () => {
    expect(resize("end", 9 * 60)).toEqual({ ok: true, bars: [bar("bar-1", "11:00", "11:30")] });
  });

  it("開始を終了より後まで動かしても、バーは消えず30分で残る", () => {
    expect(resize("start", 18 * 60)).toEqual({ ok: true, bars: [bar("bar-1", "13:30", "14:00")] });
  });

  it("受付時間の端を越えて動かすと、端で止まる", () => {
    expect(resize("start", 8 * 60)).toEqual({ ok: true, bars: [bar("bar-1", "09:00", "14:00")] });
    expect(resize("end", 23 * 60)).toEqual({ ok: true, bars: [bar("bar-1", "11:00", "22:00")] });
  });

  it("隣のバーに触れるまで伸ばしても、つなげない", () => {
    const result = resizeStaffingBar({
      bars: [bar("bar-1", "10:00", "13:00"), bar("bar-2", "14:00", "18:00")],
      barId: "bar-1",
      edge: "end",
      minutes: 14 * 60,
      rules,
    });

    expect(result).toEqual({ ok: true, bars: [bar("bar-1", "10:00", "14:00"), bar("bar-2", "14:00", "18:00")] });
  });

  it("伸ばした先で重なりが上限を超える場合は受け付けない", () => {
    const ten = Array.from({ length: 10 }, (_, index) => bar(`bar-${index + 1}`, "11:00", "14:00"));

    expect(
      resizeStaffingBar({
        bars: [...ten, bar("bar-11", "14:00", "18:00")],
        barId: "bar-11",
        edge: "start",
        minutes: 13 * 60,
        rules,
      }),
    ).toEqual({ ok: false, reason: "TOO_MANY_CONCURRENT" });
  });

  it("受付時間の外にかかるバーは、切りそろえるまで動かせない", () => {
    expect(
      resizeStaffingBar({
        bars: [bar("bar-1", "08:00", "12:00")],
        barId: "bar-1",
        edge: "end",
        minutes: 13 * 60,
        rules,
      }),
    ).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
  });

  it("対象のバーがなければ受け付けない", () => {
    expect(resizeStaffingBar({ bars, barId: "missing", edge: "end", minutes: 15 * 60, rules })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });
});

describe("removeStaffingBar / removeStaffingBars", () => {
  const bars = [bar("bar-1", "11:00", "14:00"), bar("bar-2", "11:00", "14:00"), bar("bar-3", "17:00", "22:00")];

  it("同じ時間のバーが複数あっても、選んだ1本だけを消す", () => {
    expect(removeStaffingBar(bars, "bar-2")).toEqual([bar("bar-1", "11:00", "14:00"), bar("bar-3", "17:00", "22:00")]);
  });

  it("まとめて消す", () => {
    expect(removeStaffingBars(bars, ["bar-1", "bar-2"])).toEqual([bar("bar-3", "17:00", "22:00")]);
  });

  it("対象のないidを渡しても、ほかのバーは変わらない", () => {
    expect(removeStaffingBar(bars, "missing")).toEqual(bars);
  });
});

describe("groupStaffingBars", () => {
  it("同じ時間のバーを1件にまとめ、開始の早い順、終了の早い順に並べる", () => {
    const groups = groupStaffingBars(
      [
        bar("bar-1", "17:00", "22:00"),
        bar("bar-2", "11:00", "14:00"),
        bar("bar-3", "11:00", "13:00"),
        bar("bar-4", "11:00", "14:00"),
        bar("bar-5", "11:00", "14:00", KITCHEN),
      ],
      HALL,
    );

    expect(groups).toEqual([
      { start: "11:00", end: "13:00", barIds: ["bar-3"] },
      { start: "11:00", end: "14:00", barIds: ["bar-2", "bar-4"] },
      { start: "17:00", end: "22:00", barIds: ["bar-1"] },
    ]);
  });

  it("バーのないポジションは空になる", () => {
    expect(groupStaffingBars([bar("bar-1", "11:00", "14:00")], KITCHEN)).toEqual([]);
  });
});

describe("setStaffingBarGroup", () => {
  const bars = [
    bar("bar-1", "11:00", "14:00"),
    bar("bar-2", "09:00", "22:00"),
    bar("bar-3", "11:00", "14:00"),
    bar("bar-4", "11:00", "14:00", KITCHEN),
  ];
  const change = (start: string, end: string, count: number) =>
    setStaffingBarGroup({ bars, barIds: ["bar-1", "bar-3"], start, end, count, rules });

  it("まとめたバーの時間を、本数を保ったまま変える", () => {
    expect(change("12:00", "15:00", 2)).toEqual({
      ok: true,
      bars: [
        bar("bar-1", "12:00", "15:00"),
        bar("bar-2", "09:00", "22:00"),
        bar("bar-3", "12:00", "15:00"),
        bar("bar-4", "11:00", "14:00", KITCHEN),
      ],
    });
  });

  it("本数を増やすと、同じポジション、同じ時間のバーを足す", () => {
    expect(change("11:00", "14:00", 3)).toEqual({
      ok: true,
      bars: [...bars, bar("bar-5", "11:00", "14:00")],
    });
  });

  it("本数を減らすと、後ろのバーから消す", () => {
    expect(change("11:00", "14:00", 1)).toEqual({
      ok: true,
      bars: [bar("bar-1", "11:00", "14:00"), bar("bar-2", "09:00", "22:00"), bar("bar-4", "11:00", "14:00", KITCHEN)],
    });
  });

  it("0本にはできない", () => {
    expect(change("11:00", "14:00", 0)).toEqual({ ok: false, reason: "INVALID_COUNT" });
  });

  it("最小の長さに届かない時間は受け付けない", () => {
    expect(change("11:00", "11:00", 2)).toEqual({ ok: false, reason: "TOO_SHORT" });
  });

  it("重なりが上限を超える本数は受け付けない", () => {
    // 9:00〜22:00のバーが1本あるため、同じ時間に足せるのは9本まで。
    expect(change("11:00", "14:00", 9).ok).toBe(true);
    expect(change("11:00", "14:00", 10)).toEqual({ ok: false, reason: "TOO_MANY_CONCURRENT" });
  });

  it("型のバーの上限を超える本数は受け付けない", () => {
    const smallLimit: StaffingBarRules = { ...rules, limits: { maxConcurrentPerPosition: 10, maxBars: 5 } };
    const input = { bars, barIds: ["bar-1", "bar-3"], start: "11:00", end: "14:00" };

    expect(setStaffingBarGroup({ ...input, count: 3, rules: smallLimit }).ok).toBe(true);
    expect(setStaffingBarGroup({ ...input, count: 4, rules: smallLimit })).toEqual({
      ok: false,
      reason: "TOO_MANY_BARS",
    });
  });

  it("対象のバーがなければ受け付けない", () => {
    expect(setStaffingBarGroup({ bars, barIds: ["missing"], start: "11:00", end: "14:00", count: 1, rules })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });
});

describe("countRequiredSegments", () => {
  const mockBars = [
    stored("09:00", "22:00"),
    stored("11:00", "14:00"),
    stored("11:00", "14:00"),
    stored("17:00", "22:00"),
    stored("17:00", "22:00"),
    stored("18:00", "22:00"),
    stored("18:00", "22:00"),
    stored("09:00", "22:00", KITCHEN),
    stored("11:00", "14:00", KITCHEN),
    stored("18:00", "21:00", KITCHEN),
  ];

  it("ポジションごとに、重なるバーの本数が変わる時刻で区切る", () => {
    expect(countRequiredSegments({ bars: mockBars, positionIds: [HALL, KITCHEN] })).toEqual([
      {
        positionId: HALL,
        segments: [
          { start: "09:00", end: "11:00", count: 1 },
          { start: "11:00", end: "14:00", count: 3 },
          { start: "14:00", end: "17:00", count: 1 },
          { start: "17:00", end: "18:00", count: 3 },
          { start: "18:00", end: "22:00", count: 5 },
        ],
      },
      {
        positionId: KITCHEN,
        segments: [
          { start: "09:00", end: "11:00", count: 1 },
          { start: "11:00", end: "14:00", count: 2 },
          { start: "14:00", end: "18:00", count: 1 },
          { start: "18:00", end: "21:00", count: 2 },
          { start: "21:00", end: "22:00", count: 1 },
        ],
      },
    ]);
  });

  it("隣り合うバーは人数が同じなので、1つの区間にまとめる", () => {
    expect(
      countRequiredSegments({ bars: [stored("10:00", "14:00"), stored("14:00", "18:00")], positionIds: [HALL] }),
    ).toEqual([{ positionId: HALL, segments: [{ start: "10:00", end: "18:00", count: 1 }] }]);
  });

  it("0人の区間は、指定しなければ返さない", () => {
    expect(
      countRequiredSegments({ bars: [stored("10:00", "12:00"), stored("15:00", "18:00")], positionIds: [HALL] }),
    ).toEqual([
      {
        positionId: HALL,
        segments: [
          { start: "10:00", end: "12:00", count: 1 },
          { start: "15:00", end: "18:00", count: 1 },
        ],
      },
    ]);
  });

  it("0人の区間を含める指定では、受付時間の端から端までを埋める", () => {
    expect(
      countRequiredSegments({
        bars: [stored("10:00", "12:00"), stored("15:00", "18:00")],
        positionIds: [HALL, KITCHEN],
        range: rules.range,
        includeEmpty: true,
      }),
    ).toEqual([
      {
        positionId: HALL,
        segments: [
          { start: "09:00", end: "10:00", count: 0 },
          { start: "10:00", end: "12:00", count: 1 },
          { start: "12:00", end: "15:00", count: 0 },
          { start: "15:00", end: "18:00", count: 1 },
          { start: "18:00", end: "22:00", count: 0 },
        ],
      },
      { positionId: KITCHEN, segments: [{ start: "09:00", end: "22:00", count: 0 }] },
    ]);
  });

  it("範囲を渡さずに0人の区間を含めると、最初のバーから最後のバーまでのすき間だけを埋める", () => {
    expect(
      countRequiredSegments({
        bars: [stored("10:00", "12:00"), stored("15:00", "18:00")],
        positionIds: [HALL],
        includeEmpty: true,
      }),
    ).toEqual([
      {
        positionId: HALL,
        segments: [
          { start: "10:00", end: "12:00", count: 1 },
          { start: "12:00", end: "15:00", count: 0 },
          { start: "15:00", end: "18:00", count: 1 },
        ],
      },
    ]);
  });

  it("範囲を渡すと、外にあるバーは数えず、またぐバーは内側だけを数える", () => {
    expect(
      countRequiredSegments({
        bars: [stored("07:00", "09:00"), stored("08:00", "10:00"), stored("21:00", "23:00")],
        positionIds: [HALL],
        range: rules.range,
      }),
    ).toEqual([
      {
        positionId: HALL,
        segments: [
          { start: "09:00", end: "10:00", count: 1 },
          { start: "21:00", end: "22:00", count: 1 },
        ],
      },
    ]);
  });

  it("バーのないポジションは区間が空になる", () => {
    expect(countRequiredSegments({ bars: [], positionIds: [HALL] })).toEqual([{ positionId: HALL, segments: [] }]);
  });
});

describe("countBarsOutsideRange / trimBarsToRange", () => {
  const bars = [
    bar("inside", "09:00", "22:00"),
    bar("before", "07:00", "09:00"),
    bar("after", "22:00", "23:00"),
    bar("straddle-start", "08:00", "10:00"),
    bar("straddle-end", "21:00", "23:30"),
    bar("cover", "08:00", "23:00", KITCHEN),
  ];

  it("受付時間の外にかかるバーを、完全に外のバーとまたぐバーの両方で数える", () => {
    expect(countBarsOutsideRange(bars, rules.range)).toBe(5);
  });

  it("受付時間の端ちょうどのバーは外に数えない", () => {
    expect(countBarsOutsideRange([bar("a", "09:00", "09:30"), bar("b", "21:30", "22:00")], rules.range)).toBe(0);
  });

  it("完全に外のバーを消し、またぐバーを内側へ切る", () => {
    expect(trimBarsToRange({ bars, range: rules.range, unitMinutes: 30 })).toEqual([
      bar("inside", "09:00", "22:00"),
      bar("straddle-start", "09:00", "10:00"),
      bar("straddle-end", "21:00", "22:00"),
      bar("cover", "09:00", "22:00", KITCHEN),
    ]);
  });

  it("切りそろえたあとは、外にかかるバーが残らない", () => {
    const trimmed = trimBarsToRange({ bars, range: rules.range, unitMinutes: 30 });

    expect(countBarsOutsideRange(trimmed, rules.range)).toBe(0);
  });

  it("切ったあとの長さが刻みに届かないバーは消す", () => {
    const range = { startMinutes: 9 * 60 + 45, endMinutes: 22 * 60 };

    expect(trimBarsToRange({ bars: [bar("a", "09:00", "10:00")], range, unitMinutes: 30 })).toEqual([]);
  });

  it("範囲の端が刻みにそろっていない場合は、刻みに乗る内側の時刻へ切る", () => {
    const range = { startMinutes: 9 * 60 + 45, endMinutes: 20 * 60 + 45 };

    expect(
      trimBarsToRange({
        bars: [bar("start", "09:00", "11:00"), bar("end", "19:00", "22:00"), bar("inside", "10:00", "20:30")],
        range,
        unitMinutes: 30,
      }),
    ).toEqual([bar("start", "10:00", "11:00"), bar("end", "19:00", "20:30"), bar("inside", "10:00", "20:30")]);
    expect(alignStaffingBarRange(range, 30)).toEqual({ startMinutes: 10 * 60, endMinutes: 20 * 60 + 30 });
  });

  it("範囲の内側にあるバーだけなら何も変えない", () => {
    const inside = [bar("a", "09:00", "12:00"), bar("b", "12:00", "22:00")];

    expect(trimBarsToRange({ bars: inside, range: rules.range, unitMinutes: 30 })).toEqual(inside);
  });
});

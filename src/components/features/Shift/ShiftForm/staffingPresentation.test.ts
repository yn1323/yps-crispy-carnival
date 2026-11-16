import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { NewcomerStaffIdsByPositionId } from "@/src/domains/shift/positionSkills";
import type { PositionSegment, PositionType, ShiftData, TimeRange } from "@/src/domains/shift/types";
import {
  BAND_COLLAPSE_POSITION_COUNT,
  buildDayStaffingMarks,
  buildDayStaffingView,
  buildDayTemplateView,
  buildStaffingCountView,
  type DayStaffingView,
  describeStaffingCount,
  formatStaffingCount,
  resolveBandSegmentContent,
  type StaffingBandView,
  selectStaffingShifts,
  shouldDefaultToDetailMode,
  summarizeStaffingBands,
  toStaffingBars,
} from "./staffingPresentation";
import type { ShiftFormDayRequirements, ShiftFormStaffing, ShiftFormStaffingDay } from "./types";

// 2026-05-21は木曜日、2026-05-22は金曜日。
const thursday = "2026-05-21";
const friday = "2026-05-22";

const hall: PositionType = { id: "hall", name: "ホール", color: "#0d9488", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };
const positions = [hall, kitchen];
const timeRange: TimeRange = { start: 9, end: 13, unit: 30 };

const timePattern: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "13:00" };
const shiftTypePattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
  ],
};
const dateOnlyPattern: ShiftSubmissionPattern = { kind: "dateOnly" };

const segment = (
  start: string,
  end: string,
  position: PositionType = hall,
  overrides: Partial<PositionSegment> = {},
): PositionSegment => ({
  id: `seg-${position.id}-${start}-${end}`,
  positionId: position.id,
  positionName: position.name,
  color: position.color,
  start,
  end,
  ...overrides,
});

const shift = (staffId: string, shiftPositions: PositionSegment[], breaks?: ShiftData["breaks"]): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: thursday,
  requestedTime: null,
  positions: shiftPositions,
  ...(breaks ? { breaks } : {}),
});

const bar = (start: string, end: string, position: PositionType = hall) => ({
  positionId: position.id,
  startTime: start,
  endTime: end,
});

const day = (overrides: Partial<ShiftFormStaffingDay> = {}): ShiftFormStaffingDay => ({
  date: thursday,
  source: "weekday",
  templateId: "template-weekday",
  templateName: "通常",
  requirements: null,
  ...overrides,
});

const timeDay = (bars: Array<ReturnType<typeof bar>>, overrides: Partial<ShiftFormStaffingDay> = {}) =>
  day({ requirements: { kind: "time", bars }, ...overrides });

const staffing = (overrides: Partial<ShiftFormStaffing> = {}): ShiftFormStaffing => ({
  breakRule: null,
  isLocked: false,
  templates: [],
  days: [],
  ...overrides,
});

/** どのポジションでも新人のスタッフを、ポジションごとの新人の形にする。 */
const newcomersEverywhere = (staffIds: string[]) =>
  new Map(positions.map((position) => [position.id, new Set(staffIds)]));

const buildTimeView = (input: {
  shifts?: ShiftData[];
  day?: ShiftFormStaffingDay;
  newcomerStaffIdsByPositionId?: NewcomerStaffIdsByPositionId;
  positions?: PositionType[];
}): DayStaffingView =>
  buildDayStaffingView({
    date: thursday,
    shifts: input.shifts ?? [],
    positions: input.positions ?? positions,
    submissionPattern: timePattern,
    timeRange,
    day: input.day,
    newcomerStaffIdsByPositionId: input.newcomerStaffIdsByPositionId,
  });

/** 帯の区間を、比べやすい形（時刻、文字、状態、新人だけ）へ射影する。 */
const projectBands = (view: DayStaffingView) =>
  view.bands.map((band) => ({
    name: band.name,
    isConfigured: band.isConfigured,
    hasImbalance: band.hasImbalance,
    segments: band.segments.map((item) => [item.timeLabel, item.label, item.tone, item.isNewcomerOnly]),
  }));

describe("selectStaffingShifts", () => {
  it("その日の、在籍しているスタッフの勤務だけを返し、削除済みのスタッフと一覧にないスタッフの勤務は数えない", () => {
    const active = shift("active", [segment("09:00", "13:00")]);
    const removed = shift("removed", [segment("09:00", "13:00")]);
    const unknown = shift("unknown", [segment("09:00", "13:00")]);
    const otherDay = { ...shift("active", [segment("09:00", "13:00")]), id: "shift-active-friday", date: friday };

    const result = selectStaffingShifts(
      [active, removed, unknown, otherDay],
      [{ id: "active" }, { id: "removed", isRemoved: true }],
      thursday,
    );

    expect(result).toEqual([active]);
  });
});

describe("buildStaffingCountView", () => {
  it("足りない場合は「人数/必要 ▲差」にし、狭い場所には差だけを出す", () => {
    expect(buildStaffingCountView({ count: 2, required: 3, isNewcomerOnly: false })).toEqual({
      count: 2,
      required: 3,
      tone: "shortage",
      isNewcomerOnly: false,
      label: "2/3 ▲1",
      compactLabel: "▲1",
    });
  });

  it("多い場合は「人数/必要 ＋差」にし、狭い場所には差だけを出す", () => {
    expect(buildStaffingCountView({ count: 3, required: 1, isNewcomerOnly: true })).toEqual({
      count: 3,
      required: 1,
      tone: "excess",
      isNewcomerOnly: true,
      label: "3/1 ＋2",
      compactLabel: "＋2",
    });
  });

  it("ちょうどの場合は記号を付けず、狭い場所には人数だけを出す", () => {
    expect(buildStaffingCountView({ count: 3, required: 3, isNewcomerOnly: false })).toMatchObject({
      tone: "even",
      label: "3/3",
      compactLabel: "3",
    });
    expect(buildStaffingCountView({ count: 0, required: 0, isNewcomerOnly: false })).toMatchObject({
      tone: "even",
      label: "0/0",
    });
  });

  it("必要人数が未設定の場合は、人が入っていても過不足にせず、人数だけを出す", () => {
    expect(buildStaffingCountView({ count: 2, required: null, isNewcomerOnly: false })).toEqual({
      count: 2,
      required: null,
      tone: "unset",
      isNewcomerOnly: false,
      label: "2",
      compactLabel: "2",
    });
  });
});

describe("describeStaffingCount", () => {
  it("足りない区間は、人数、必要人数、足りない人数を説明する", () => {
    expect(describeStaffingCount(buildStaffingCountView({ count: 1, required: 3, isNewcomerOnly: false }))).toEqual([
      "人数 1人 / 必要 3人",
      "2人足りません",
    ]);
  });

  it("多い区間で新人だけの場合は、多い人数と新人だけであることを説明する", () => {
    expect(describeStaffingCount(buildStaffingCountView({ count: 2, required: 1, isNewcomerOnly: true }))).toEqual([
      "人数 2人 / 必要 1人",
      "1人多くなっています",
      "新人だけの時間です",
    ]);
  });

  it("必要人数が未設定の区間は、人数だけを説明する", () => {
    expect(describeStaffingCount(buildStaffingCountView({ count: 2, required: null, isNewcomerOnly: false }))).toEqual([
      "人数 2人",
    ]);
  });
});

describe("toStaffingBars", () => {
  it("時間指定の必要人数を、時間の軸に置くバーの形へ直す", () => {
    expect(toStaffingBars({ kind: "time", bars: [bar("09:00", "11:00"), bar("10:00", "13:00", kitchen)] })).toEqual([
      { positionId: "hall", start: "09:00", end: "11:00" },
      { positionId: "kitchen", start: "10:00", end: "13:00" },
    ]);
  });

  it("バーのない必要人数は空のバーにし、未設定と時間指定ではない必要人数はnullにする", () => {
    expect(toStaffingBars({ kind: "time", bars: [] })).toEqual([]);
    expect(toStaffingBars(null)).toBeNull();
    expect(toStaffingBars(undefined)).toBeNull();
    expect(toStaffingBars({ kind: "dateOnly", counts: [{ positionId: "hall", count: 2 }] })).toBeNull();
  });
});

describe("buildDayTemplateView", () => {
  it("曜日、祝日の型が当たっている日は、型の名前を出し、その型にチェックを付ける", () => {
    for (const source of ["weekday", "holiday"] as const) {
      expect(buildDayTemplateView(timeDay([bar("09:00", "13:00")], { source }))).toEqual({
        label: "通常",
        templateId: "template-weekday",
        templateName: "通常",
        isCustom: false,
        isDateSpecific: false,
      });
    }
  });

  it("その日だけ別の型を当てた日は、型の名前を出し、曜日の設定へ戻せる", () => {
    const view = buildDayTemplateView(
      timeDay([bar("09:00", "13:00")], {
        source: "dateTemplate",
        templateId: "template-event",
        templateName: "繁忙日",
      }),
    );

    expect(view).toEqual({
      label: "繁忙日",
      templateId: "template-event",
      templateName: "繁忙日",
      isCustom: false,
      isDateSpecific: true,
    });
  });

  it("その日だけ人数を変えた日は「この日だけ変更」と出し、どの型にもチェックを付けない", () => {
    const view = buildDayTemplateView(
      timeDay([bar("09:00", "13:00")], { source: "dateCustom", templateId: null, templateName: null }),
    );

    expect(view).toEqual({
      label: "この日だけ変更",
      templateId: null,
      templateName: null,
      isCustom: true,
      isDateSpecific: true,
    });
  });

  it("その日だけ人数を変えた日で、元の型の名前が分かる場合は、名前のあとに「（この日だけ変更）」を付ける", () => {
    const view = buildDayTemplateView(
      timeDay([bar("09:00", "13:00")], { source: "dateCustom", templateId: null, templateName: "通常" }),
    );

    expect(view.label).toBe("通常（この日だけ変更）");
    expect(view.templateId).toBeNull();
  });

  it("型が当たらない日と、必要人数が渡されない日は「未設定」と出す", () => {
    const unset = { label: "未設定", templateId: null, templateName: null, isCustom: false, isDateSpecific: false };

    expect(buildDayTemplateView(day({ source: "none", templateId: null, templateName: null }))).toEqual(unset);
    expect(buildDayTemplateView(undefined)).toEqual(unset);
  });

  it("型が当たっていても、集め方が合わず必要人数がない日は「未設定」と出し、どの型にもチェックを付けない", () => {
    expect(buildDayTemplateView(day({ source: "weekday", requirements: null }))).toEqual({
      label: "未設定",
      templateId: null,
      templateName: null,
      isCustom: false,
      isDateSpecific: false,
    });
  });

  it("確定済みの日は、確定時の型の名前を出す", () => {
    const view = buildDayTemplateView(
      timeDay([bar("09:00", "13:00")], { source: "confirmed", templateId: null, templateName: "通常" }),
    );

    expect(view).toEqual({
      label: "通常",
      templateId: null,
      templateName: "通常",
      isCustom: false,
      isDateSpecific: false,
    });
  });

  it("確定済みで、型の名前がなく必要人数だけが残っている日は「この日だけ変更」と出す", () => {
    const view = buildDayTemplateView(
      timeDay([bar("09:00", "13:00")], { source: "confirmed", templateId: null, templateName: null }),
    );

    expect(view.label).toBe("この日だけ変更");
    expect(view.isDateSpecific).toBe(false);
  });

  it("確定済みで、必要人数の保存がない日は「未設定」と出す", () => {
    expect(buildDayTemplateView(day({ source: "confirmed", templateId: null, templateName: null })).label).toBe(
      "未設定",
    );
  });
});

describe("buildDayStaffingView", () => {
  describe("時間指定の帯", () => {
    it("ポジションごとに、人数か必要人数が変わる時刻で区切り、足りない、多い、ちょうどを出す", () => {
      const view = buildTimeView({
        shifts: [
          shift("a", [segment("09:00", "13:00")]),
          shift("b", [segment("09:00", "11:00")]),
          shift("c", [segment("10:00", "13:00", kitchen)]),
        ],
        day: timeDay([
          bar("09:00", "13:00"),
          bar("09:00", "10:00"),
          bar("11:00", "13:00"),
          bar("09:00", "13:00", kitchen),
        ]),
      });

      expect(projectBands(view)).toEqual([
        {
          name: "ホール",
          isConfigured: true,
          hasImbalance: true,
          segments: [
            ["09:00〜10:00", "2/2", "even", false],
            ["10:00〜11:00", "2/1 ＋1", "excess", false],
            ["11:00〜13:00", "1/2 ▲1", "shortage", false],
          ],
        },
        {
          name: "キッチン",
          isConfigured: true,
          hasImbalance: true,
          segments: [
            ["09:00〜10:00", "0/1 ▲1", "shortage", false],
            ["10:00〜13:00", "1/1", "even", false],
          ],
        },
      ]);
      expect(view).toMatchObject({
        date: thursday,
        hasRequirements: true,
        hasShortage: true,
        hasExcess: true,
        shortageCount: 2,
        slots: [],
      });
      expect(view.template.label).toBe("通常");
    });

    it("区間は、時間の軸に置く分と、読み上げに使う全文を持つ", () => {
      const view = buildTimeView({
        shifts: [shift("new", [segment("09:00", "11:00")])],
        day: timeDay([bar("09:00", "11:00"), bar("09:00", "11:00")]),
        newcomerStaffIdsByPositionId: newcomersEverywhere(["new"]),
      });

      expect(view.bands[0].segments).toEqual([
        {
          key: "09:00",
          startMinutes: 540,
          endMinutes: 660,
          timeLabel: "09:00〜11:00",
          description: "ホール 09:00〜11:00 1/2 ▲1、新人だけ",
          count: 1,
          required: 2,
          tone: "shortage",
          isNewcomerOnly: true,
          label: "1/2 ▲1",
          compactLabel: "▲1",
        },
      ]);
    });

    it("休憩中の人は数えず、休憩の開始と終了で区切る", () => {
      const view = buildTimeView({
        shifts: [shift("a", [segment("09:00", "13:00")], [{ start: "10:00", end: "11:00" }])],
        day: timeDay([bar("09:00", "13:00")]),
      });

      expect(projectBands(view)[0].segments).toEqual([
        ["09:00〜10:00", "1/1", "even", false],
        ["10:00〜11:00", "0/1 ▲1", "shortage", false],
        ["11:00〜13:00", "1/1", "even", false],
      ]);
    });

    it("だれもいなくて必要人数もない区間は、帯に出さない", () => {
      const view = buildTimeView({
        shifts: [shift("a", [segment("12:00", "13:00")])],
        day: timeDay([bar("09:00", "10:00")]),
      });

      // 10:00〜12:00は、だれもいなくて必要人数もない。
      expect(projectBands(view)[0].segments).toEqual([
        ["09:00〜10:00", "0/1 ▲1", "shortage", false],
        ["12:00〜13:00", "1/0 ＋1", "excess", false],
      ]);
    });

    it("バーが1本もないポジションは未設定とし、人が入っていても過不足を出さず、人数だけを出す", () => {
      const view = buildTimeView({
        shifts: [shift("a", [segment("09:00", "13:00")]), shift("b", [segment("09:00", "11:00", kitchen)])],
        day: timeDay([bar("09:00", "13:00")]),
      });

      expect(projectBands(view)).toEqual([
        { name: "ホール", isConfigured: true, hasImbalance: false, segments: [["09:00〜13:00", "1/1", "even", false]] },
        // キッチンにはバーがないため、0人の11:00〜13:00も出さない。
        {
          name: "キッチン",
          isConfigured: false,
          hasImbalance: false,
          segments: [["09:00〜11:00", "1", "unset", false]],
        },
      ]);
      expect(view.hasRequirements).toBe(true);
      expect(view.hasShortage).toBe(false);
      expect(view.hasExcess).toBe(false);
    });

    it("必要人数が未設定の日は、全ポジションの人数だけを出し、過不足を出さない", () => {
      for (const unsetDay of [undefined, day({ source: "none", templateId: null, templateName: null })]) {
        const view = buildTimeView({
          shifts: [shift("a", [segment("09:00", "12:00")]), shift("b", [segment("10:00", "12:00")])],
          day: unsetDay,
        });

        expect(projectBands(view)).toEqual([
          {
            name: "ホール",
            isConfigured: false,
            hasImbalance: false,
            segments: [
              ["09:00〜10:00", "1", "unset", false],
              ["10:00〜12:00", "2", "unset", false],
            ],
          },
          { name: "キッチン", isConfigured: false, hasImbalance: false, segments: [] },
        ]);
        expect(view).toMatchObject({ hasRequirements: false, hasShortage: false, hasExcess: false, shortageCount: 0 });
        expect(view.template.label).toBe("未設定");
      }
    });

    it("ホールでは標準でキッチンでは新人の人が1人でいる場合、キッチンの帯だけに新人だけの印を付ける", () => {
      const view = buildTimeView({
        shifts: [shift("mix", [segment("09:00", "11:00", hall), segment("11:00", "13:00", kitchen)])],
        day: undefined,
        newcomerStaffIdsByPositionId: new Map([[kitchen.id, new Set(["mix"])]]),
      });

      expect(projectBands(view).map((band) => [band.name, band.segments])).toEqual([
        ["ホール", [["09:00〜11:00", "1", "unset", false]]],
        ["キッチン", [["11:00〜13:00", "1", "unset", true]]],
      ]);
    });

    it("そのポジションの全員が新人の区間だけに印を付け、標準の人が入る時刻で区切る", () => {
      const view = buildTimeView({
        shifts: [shift("new", [segment("09:00", "13:00")]), shift("std", [segment("11:00", "13:00")])],
        day: undefined,
        newcomerStaffIdsByPositionId: newcomersEverywhere(["new"]),
      });

      expect(projectBands(view)[0].segments).toEqual([
        ["09:00〜11:00", "1", "unset", true],
        ["11:00〜13:00", "2", "unset", false],
      ]);
    });

    it("数える範囲は募集の受付時間の内側だけにする", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [shift("a", [segment("09:00", "13:00")])],
        positions: [hall],
        submissionPattern: timePattern,
        // 表示は9時〜13時、受付時間は9:30〜12:30。
        timeRange: { ...timeRange, editableStartMinutes: 570, editableEndMinutes: 750 },
        day: timeDay([bar("09:30", "12:30")]),
      });

      expect(projectBands(view)[0].segments).toEqual([["09:30〜12:30", "1/1", "even", false]]);
    });
  });

  describe("パターン選択", () => {
    const requirements: ShiftFormDayRequirements = {
      kind: "shiftType",
      options: [
        {
          optionId: "early",
          counts: [
            { positionId: hall.id, count: 2 },
            { positionId: kitchen.id, count: 1 },
          ],
        },
      ],
    };
    const early = { shiftTypeOptionId: "early" };
    const late = { shiftTypeOptionId: "late" };

    it("勤務パターンごとに、足りない人数、多い人数、新人だけの印を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [
          shift("new", [segment("09:00", "15:00", hall, early)]),
          shift("b", [segment("09:00", "15:00", kitchen, early)]),
          shift("c", [segment("09:00", "15:00", kitchen, early), segment("15:00", "21:00", hall, late)]),
        ],
        positions,
        submissionPattern: shiftTypePattern,
        timeRange,
        day: day({ requirements }),
        newcomerStaffIdsByPositionId: newcomersEverywhere(["new"]),
      });

      expect(
        view.slots.map((slot) => ({
          id: slot.id,
          label: slot.label,
          total: slot.total,
          hasShortage: slot.hasShortage,
          hasExcess: slot.hasExcess,
          positions: slot.positions.map((item) => [item.name, item.label, item.tone, item.isNewcomerOnly]),
        })),
      ).toEqual([
        {
          id: "shiftType:early",
          label: "早番",
          total: 3,
          hasShortage: true,
          hasExcess: true,
          positions: [
            ["ホール", "1/2 ▲1", "shortage", true],
            ["キッチン", "2/1 ＋1", "excess", false],
          ],
        },
        {
          id: "shiftType:late",
          label: "遅番",
          total: 1,
          hasShortage: false,
          hasExcess: false,
          positions: [
            ["ホール", "1", "unset", false],
            ["キッチン", "0", "unset", false],
          ],
        },
      ]);
      expect(view).toMatchObject({
        hasRequirements: true,
        hasShortage: true,
        hasExcess: true,
        shortageCount: 1,
        bands: [],
      });
    });

    it("必要人数が未設定の日も、勤務パターンごとの人数だけを出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [shift("a", [segment("09:00", "15:00", hall, early)])],
        positions,
        submissionPattern: shiftTypePattern,
        timeRange,
        day: undefined,
      });

      expect(view.slots.map((slot) => [slot.label, slot.positions.map((item) => item.label)])).toEqual([
        ["早番", ["1", "0"]],
        ["遅番", ["0", "0"]],
      ]);
      expect(view).toMatchObject({ hasRequirements: false, hasShortage: false, hasExcess: false, shortageCount: 0 });
    });
  });

  describe("日付選択", () => {
    it("1日を1つの区切りとして、足りない人数、多い人数、新人だけの印を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [
          shift("new1", [segment("09:00", "22:00")]),
          shift("new2", [segment("09:00", "22:00")]),
          shift("c", [segment("09:00", "22:00", kitchen)]),
        ],
        positions,
        submissionPattern: dateOnlyPattern,
        timeRange,
        day: day({
          requirements: {
            kind: "dateOnly",
            counts: [
              { positionId: hall.id, count: 1 },
              { positionId: kitchen.id, count: 2 },
            ],
          },
        }),
        newcomerStaffIdsByPositionId: newcomersEverywhere(["new1", "new2"]),
      });

      expect(view.slots).toHaveLength(1);
      expect(view.slots[0]).toMatchObject({ id: "allDay", label: "1日", total: 3, hasShortage: true, hasExcess: true });
      expect(view.slots[0].positions.map((item) => [item.name, item.label, item.tone, item.isNewcomerOnly])).toEqual([
        ["ホール", "2/1 ＋1", "excess", true],
        ["キッチン", "1/2 ▲1", "shortage", false],
      ]);
      expect(view.shortageCount).toBe(1);
    });

    it("必要人数が未設定の日も、1日の人数だけを出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [shift("a", [segment("09:00", "22:00")])],
        positions,
        submissionPattern: dateOnlyPattern,
        timeRange,
        day: undefined,
      });

      expect(view.slots[0].positions.map((item) => [item.label, item.tone])).toEqual([
        ["1", "unset"],
        ["0", "unset"],
      ]);
      expect(view.hasRequirements).toBe(false);
    });
  });
});

describe("resolveBandSegmentContent", () => {
  const shortage = buildStaffingCountView({ count: 2, required: 3, isNewcomerOnly: false });
  const shortageNewcomer = buildStaffingCountView({ count: 2, required: 3, isNewcomerOnly: true });
  const even = buildStaffingCountView({ count: 3, required: 3, isNewcomerOnly: false });
  const unset = buildStaffingCountView({ count: 2, required: null, isNewcomerOnly: false });
  const unsetNewcomer = buildStaffingCountView({ count: 2, required: null, isNewcomerOnly: true });

  it("全文が入る幅では全文を出す（「2/3 ▲1」は50px以上）", () => {
    expect(resolveBandSegmentContent(shortage, 50)).toEqual({
      text: "2/3 ▲1",
      isFullText: true,
      showsNewcomerMark: false,
    });
  });

  it("全文が入らない幅では差だけを出す（「▲1」は22px以上）", () => {
    expect(resolveBandSegmentContent(shortage, 49)).toEqual({
      text: "▲1",
      isFullText: false,
      showsNewcomerMark: false,
    });
    expect(resolveBandSegmentContent(shortage, 22)).toEqual({
      text: "▲1",
      isFullText: false,
      showsNewcomerMark: false,
    });
  });

  it("差も入らない幅では文字を出さない", () => {
    expect(resolveBandSegmentContent(shortage, 21)).toEqual({
      text: null,
      isFullText: false,
      showsNewcomerMark: false,
    });
  });

  it("ちょうどの区間は、狭い幅では人数だけを出す", () => {
    expect(resolveBandSegmentContent(even, 29).text).toBe("3/3");
    expect(resolveBandSegmentContent(even, 28)).toEqual({ text: "3", isFullText: false, showsNewcomerMark: false });
  });

  it("未設定の区間は人数だけが全文なので、入る幅なら全文として扱う", () => {
    expect(resolveBandSegmentContent(unset, 15)).toEqual({ text: "2", isFullText: true, showsNewcomerMark: false });
    expect(resolveBandSegmentContent(unset, 14).text).toBeNull();
  });

  it("新人だけの区間は、全文と印が並ぶ幅（全文の幅＋16px）で両方を出す", () => {
    expect(resolveBandSegmentContent(shortageNewcomer, 66)).toEqual({
      text: "2/3 ▲1",
      isFullText: true,
      showsNewcomerMark: true,
    });
  });

  it("新人だけの区間は、全文と印が並ばない幅では、差だけにして印を残す", () => {
    // 全文だけなら入る幅でも、印を優先する。
    expect(resolveBandSegmentContent(shortageNewcomer, 65)).toEqual({
      text: "▲1",
      isFullText: false,
      showsNewcomerMark: true,
    });
    expect(resolveBandSegmentContent(shortageNewcomer, 38)).toEqual({
      text: "▲1",
      isFullText: false,
      showsNewcomerMark: true,
    });
  });

  it("新人だけの区間でも、印が入らない幅では、印を省いて文字だけを出す", () => {
    expect(resolveBandSegmentContent(shortageNewcomer, 37)).toEqual({
      text: "▲1",
      isFullText: false,
      showsNewcomerMark: false,
    });
    expect(resolveBandSegmentContent(unsetNewcomer, 30)).toEqual({
      text: "2",
      isFullText: true,
      showsNewcomerMark: false,
    });
    expect(resolveBandSegmentContent(unsetNewcomer, 31).showsNewcomerMark).toBe(true);
  });
});

describe("summarizeStaffingBands", () => {
  const band = (name: string, hasImbalance: boolean): StaffingBandView => ({
    positionId: name,
    name,
    color: "#000000",
    isConfigured: true,
    hasImbalance,
    segments: [],
  });
  const names = (bands: StaffingBandView[]) => bands.map((item) => item.name);

  it("ポジションが3つ以下なら、過不足がなくても全行を出す", () => {
    const bands = [band("A", true), band("B", false), band("C", false)];

    expect(bands).toHaveLength(BAND_COLLAPSE_POSITION_COUNT - 1);
    expect(summarizeStaffingBands({ bands, hasRequirements: true }, false)).toEqual({
      visibleBands: bands,
      toggleLabel: null,
    });
  });

  it("ポジションが4つ以上なら、過不足のあるポジションだけを出し、残りを1行にまとめる", () => {
    const bands = [band("A", true), band("B", false), band("C", true), band("D", false)];
    const summary = summarizeStaffingBands({ bands, hasRequirements: true }, false);

    expect(names(summary.visibleBands)).toEqual(["A", "C"]);
    expect(summary.toggleLabel).toBe("ほか2つは過不足なし");
  });

  it("まとめた行を開くと、全行を元の並びで出し、たたむ文言にする", () => {
    const bands = [band("A", true), band("B", false), band("C", true), band("D", false)];
    const summary = summarizeStaffingBands({ bands, hasRequirements: true }, true);

    expect(names(summary.visibleBands)).toEqual(["A", "B", "C", "D"]);
    expect(summary.toggleLabel).toBe("過不足のあるポジションだけにする");
  });

  it("どのポジションにも過不足がなければ、全行をまとめる", () => {
    const bands = [band("A", false), band("B", false), band("C", false), band("D", false)];
    const summary = summarizeStaffingBands({ bands, hasRequirements: true }, false);

    expect(summary.visibleBands).toEqual([]);
    expect(summary.toggleLabel).toBe("4つとも過不足なし");
  });

  it("全ポジションに過不足があれば、まとめる行がないので切り替えを出さない", () => {
    const bands = [band("A", true), band("B", true), band("C", true), band("D", true)];

    expect(summarizeStaffingBands({ bands, hasRequirements: true }, false)).toEqual({
      visibleBands: bands,
      toggleLabel: null,
    });
  });

  it("必要人数が未設定の日は過不足がないため、まとめずに全ポジションの人数を出す", () => {
    const bands = [band("A", false), band("B", false), band("C", false), band("D", false)];

    expect(summarizeStaffingBands({ bands, hasRequirements: false }, false)).toEqual({
      visibleBands: bands,
      toggleLabel: null,
    });
  });
});

describe("buildDayStaffingMarks", () => {
  const view = (hasShortage: boolean, hasExcess: boolean) =>
    ({ hasShortage, hasExcess }) as Pick<DayStaffingView, "hasShortage" | "hasExcess"> as DayStaffingView;

  it("不足のある日と多い時間のある日だけに印を付け、どちらもない日は含めない", () => {
    const marks = buildDayStaffingMarks(
      new Map([
        ["2026-05-21", view(true, false)],
        ["2026-05-22", view(false, true)],
        ["2026-05-23", view(true, true)],
        ["2026-05-24", view(false, false)],
      ]),
    );

    expect([...marks]).toEqual([
      ["2026-05-21", { hasShortage: true, hasExcess: false }],
      ["2026-05-22", { hasShortage: false, hasExcess: true }],
      ["2026-05-23", { hasShortage: true, hasExcess: true }],
    ]);
  });
});

describe("formatStaffingCount", () => {
  it("必要人数がある場合は「人数/必要人数」で示す", () => {
    expect(formatStaffingCount(2, 3)).toBe("2/3");
    expect(formatStaffingCount(0, 0)).toBe("0/0");
  });

  it("必要人数が未設定の場合は人数だけを示す", () => {
    expect(formatStaffingCount(2, null)).toBe("2");
    expect(formatStaffingCount(0, null)).toBe("0");
  });
});

describe("shouldDefaultToDetailMode", () => {
  it("何も設定していない店舗は、シンプルを初期状態にする", () => {
    expect(shouldDefaultToDetailMode({ positionCount: 1, staffing: undefined, hasStaffProfiles: false })).toBe(false);
    expect(shouldDefaultToDetailMode({ positionCount: 1, staffing: staffing(), hasStaffProfiles: false })).toBe(false);
    expect(shouldDefaultToDetailMode({ positionCount: 0, staffing: staffing(), hasStaffProfiles: false })).toBe(false);
    // 型が当たらない日だけの募集は、設定がないのと同じに扱う。
    expect(
      shouldDefaultToDetailMode({
        positionCount: 1,
        staffing: staffing({ days: [day({ source: "none", templateId: null, templateName: null })] }),
        hasStaffProfiles: false,
      }),
    ).toBe(false);
  });

  it("ポジションが2つ以上ある店舗は、くわしくを初期状態にする", () => {
    expect(shouldDefaultToDetailMode({ positionCount: 2, staffing: undefined, hasStaffProfiles: false })).toBe(true);
  });

  it("当てられる型がある店舗は、くわしくを初期状態にする", () => {
    expect(
      shouldDefaultToDetailMode({
        positionCount: 1,
        staffing: staffing({ templates: [{ id: "template-1", name: "平日" }] }),
        hasStaffProfiles: false,
      }),
    ).toBe(true);
  });

  it("必要人数を持つ日がある募集は、当てられる型がなくても、くわしくを初期状態にする", () => {
    expect(
      shouldDefaultToDetailMode({
        positionCount: 1,
        staffing: staffing({ days: [timeDay([bar("09:00", "13:00")], { source: "confirmed", templateId: null })] }),
        hasStaffProfiles: false,
      }),
    ).toBe(true);
  });

  it("休憩の決まりがある店舗は、くわしくを初期状態にする", () => {
    expect(
      shouldDefaultToDetailMode({
        positionCount: 1,
        staffing: staffing({ breakRule: { minWorkMinutes: 360, breakMinutes: 45 } }),
        hasStaffProfiles: false,
      }),
    ).toBe(true);
  });

  it("スタッフの属性を設定している店舗は、くわしくを初期状態にする", () => {
    expect(shouldDefaultToDetailMode({ positionCount: 1, staffing: staffing(), hasStaffProfiles: true })).toBe(true);
  });
});

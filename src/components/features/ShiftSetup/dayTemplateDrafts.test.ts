import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { SHIFT_DAY_TEMPLATE_LIMIT, SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX } from "@/convex/constants";
import { toEditableStaffingBars, trimBarsToRange } from "@/src/domains/shift/staffingBars";
import {
  ALL_DAY_ROW_ID,
  changeDayTemplateBars,
  changeRequiredCount,
  copyDayTemplateRequirements,
  createDayTemplateDraft,
  findDayTemplateDraftIssues,
  findDayTemplateInputsIssue,
  formatDayTemplateUsage,
  getDayTemplateLabel,
  getRequiredCountRows,
  getRequiredCountTableCounts,
  getStaffingBarRange,
  getUnassignedWeekdays,
  isSameDayTemplateInputs,
  needsDayTemplateReentry,
  removeDayTemplate,
  renameDayTemplate,
  resolveSelectedDayTemplate,
  toDayTemplateDrafts,
  toDayTemplateDraftsFromSuggestion,
  toDayTemplateInputs,
  toggleDayTemplateHoliday,
  toggleDayTemplateWeekday,
} from "./dayTemplateDrafts";
import type {
  DayTemplateDraft,
  DayTemplateRequirementsDraft,
  ShiftSetupDayTemplate,
  ShiftSetupSubmissionPattern,
} from "./types";

const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const removedPosition = "position-removed" as Id<"positions">;
const positions = [{ _id: hall }, { _id: kitchen }];
const templateId = "template-a" as Id<"shiftDayTemplates">;

const timePattern: ShiftSetupSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const shiftTypePattern: ShiftSetupSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};
const dateOnlyPattern: ShiftSetupSubmissionPattern = { kind: "dateOnly" };

const timeContext = { positions, pattern: timePattern };

const bar = (positionId: string, start: string, end: string) => ({ positionId, start, end });

function timeRequirements(...bars: ReturnType<typeof bar>[]): DayTemplateRequirementsDraft {
  return { kind: "time", bars: toEditableStaffingBars(bars) };
}

function draft(overrides: Partial<DayTemplateDraft> = {}): DayTemplateDraft {
  return {
    rowKey: "a",
    name: "平日",
    weekdays: ["mon"],
    appliesToHolidays: false,
    requirements: timeRequirements(bar(hall, "09:00", "22:00")),
    requiresReentry: false,
    ...overrides,
  };
}

function savedTemplate(overrides: Partial<ShiftSetupDayTemplate> = {}): ShiftSetupDayTemplate {
  return {
    _id: templateId,
    name: "平日",
    weekdays: ["mon", "tue"],
    appliesToHolidays: false,
    requirements: { kind: "time", bars: [] },
    requiresReentry: false,
    ...overrides,
  };
}

describe("保存済みの型を編集中の形へ直す", () => {
  it("時間指定は、バーの時刻の名前を直し、型の中で一意なidを振る。受付時間の外のバーも残す", () => {
    const [converted] = toDayTemplateDrafts([
      savedTemplate({
        appliesToHolidays: true,
        requirements: {
          kind: "time",
          bars: [
            { positionId: hall, startTime: "07:00", endTime: "10:00" },
            { positionId: hall, startTime: "11:00", endTime: "14:00" },
            { positionId: kitchen, startTime: "11:00", endTime: "14:00" },
          ],
        },
      }),
    ]);

    expect(converted).toEqual({
      rowKey: templateId,
      id: templateId,
      name: "平日",
      weekdays: ["mon", "tue"],
      appliesToHolidays: true,
      requirements: {
        kind: "time",
        bars: [
          { id: "bar-1", positionId: hall, start: "07:00", end: "10:00" },
          { id: "bar-2", positionId: hall, start: "11:00", end: "14:00" },
          { id: "bar-3", positionId: kitchen, start: "11:00", end: "14:00" },
        ],
      },
      requiresReentry: false,
    });
  });

  it("パターン選択は、勤務パターンごとの人数を持ち、人数のない勤務パターンは持たない", () => {
    const [converted] = toDayTemplateDrafts([
      savedTemplate({
        requirements: {
          kind: "shiftType",
          options: [
            {
              optionId: "early",
              counts: [
                { positionId: hall, count: 2 },
                { positionId: kitchen, count: 0 },
              ],
            },
            { optionId: "late", counts: [] },
          ],
        },
      }),
    ]);

    expect(converted.requirements).toEqual({ kind: "shiftType", counts: { early: { [hall]: 2 } } });
  });

  it("日付選択は、ポジションごとの人数を持つ", () => {
    const [converted] = toDayTemplateDrafts([
      savedTemplate({
        requirements: {
          kind: "dateOnly",
          counts: [
            { positionId: hall, count: 4 },
            { positionId: kitchen, count: 2 },
          ],
        },
      }),
    ]);

    expect(converted.requirements).toEqual({ kind: "dateOnly", counts: { [hall]: 4, [kitchen]: 2 } });
  });

  it("集め方を変えたあとの型は、空の必要人数と、入れ直しの印を持つ", () => {
    const [converted] = toDayTemplateDrafts([
      savedTemplate({ requirements: { kind: "dateOnly", counts: [] }, requiresReentry: true }),
    ]);

    expect(converted.requirements).toEqual({ kind: "dateOnly", counts: {} });
    expect(needsDayTemplateReentry(converted)).toBe(true);
    // 人数を入れ直したら、保存の前でも知らせを出さない。
    const [reentered] = changeRequiredCount([converted], templateId, {
      rowId: ALL_DAY_ROW_ID,
      positionId: hall,
      count: 1,
    });
    expect(needsDayTemplateReentry(reentered)).toBe(false);
  });

  it("AIの下書きは、idを持たない新しい型になり、バーの形で入る", () => {
    let count = 0;
    const converted = toDayTemplateDraftsFromSuggestion(
      [
        {
          name: "週末",
          weekdays: ["sat", "sun"],
          appliesToHolidays: false,
          requirements: {
            kind: "time",
            bars: [
              { positionId: hall, startTime: "09:00", endTime: "22:00" },
              { positionId: hall, startTime: "11:00", endTime: "14:00" },
            ],
          },
        },
      ],
      () => {
        count += 1;
        return `new-${count}`;
      },
    );

    expect(converted).toEqual([
      {
        rowKey: "new-1",
        name: "週末",
        weekdays: ["sat", "sun"],
        appliesToHolidays: false,
        requirements: {
          kind: "time",
          bars: [
            { id: "bar-1", positionId: hall, start: "09:00", end: "22:00" },
            { id: "bar-2", positionId: hall, start: "11:00", end: "14:00" },
          ],
        },
        requiresReentry: false,
      },
    ]);
  });
});

describe("保存する形への変換", () => {
  it("バーのidと行の識別子を外し、曜日は日曜から、バーは開始・終了・ポジションの順に並べる", () => {
    const inputs = toDayTemplateInputs(
      [
        draft({
          id: templateId,
          rowKey: templateId,
          name: " 平日 ",
          weekdays: ["fri", "mon", "sun"],
          appliesToHolidays: true,
          requirements: timeRequirements(
            bar(kitchen, "11:00", "14:00"),
            bar(hall, "17:00", "22:00"),
            bar(hall, "11:00", "14:00"),
            bar(hall, "11:00", "13:00"),
          ),
        }),
        draft({ rowKey: "new-1", name: "土曜", weekdays: ["sat"] }),
      ],
      timeContext,
    );

    expect(inputs).toEqual([
      {
        id: templateId,
        name: " 平日 ",
        weekdays: ["sun", "mon", "fri"],
        appliesToHolidays: true,
        requirements: {
          kind: "time",
          bars: [
            { positionId: hall, startTime: "11:00", endTime: "13:00" },
            { positionId: hall, startTime: "11:00", endTime: "14:00" },
            { positionId: kitchen, startTime: "11:00", endTime: "14:00" },
            { positionId: hall, startTime: "17:00", endTime: "22:00" },
          ],
        },
      },
      {
        name: "土曜",
        weekdays: ["sat"],
        appliesToHolidays: false,
        requirements: { kind: "time", bars: [{ positionId: hall, startTime: "09:00", endTime: "22:00" }] },
      },
    ]);
  });

  it("同じ時間のバーは、本数分をそのまま送る。隣り合うバーはつなげない", () => {
    const [input] = toDayTemplateInputs(
      [
        draft({
          requirements: timeRequirements(
            bar(hall, "10:00", "14:00"),
            bar(hall, "14:00", "18:00"),
            bar(hall, "10:00", "14:00"),
          ),
        }),
      ],
      timeContext,
    );

    expect(input.requirements).toEqual({
      kind: "time",
      bars: [
        { positionId: hall, startTime: "10:00", endTime: "14:00" },
        { positionId: hall, startTime: "10:00", endTime: "14:00" },
        { positionId: hall, startTime: "14:00", endTime: "18:00" },
      ],
    });
  });

  it("いまは無いポジションのバーと人数は送らない", () => {
    const [timeInput] = toDayTemplateInputs(
      [
        draft({
          requirements: timeRequirements(bar(removedPosition, "09:00", "12:00"), bar(kitchen, "09:00", "12:00")),
        }),
      ],
      timeContext,
    );
    const [dateInput] = toDayTemplateInputs(
      [draft({ requirements: { kind: "dateOnly", counts: { [removedPosition]: 3, [kitchen]: 1 } } })],
      { positions, pattern: dateOnlyPattern },
    );

    expect(timeInput.requirements).toEqual({
      kind: "time",
      bars: [{ positionId: kitchen, startTime: "09:00", endTime: "12:00" }],
    });
    expect(dateInput.requirements).toEqual({ kind: "dateOnly", counts: [{ positionId: kitchen, count: 1 }] });
  });

  it("パターン選択は、勤務パターンを設定順、人数をポジションの並び順にし、人数のない勤務パターンを送らない", () => {
    const [input] = toDayTemplateInputs(
      [
        draft({
          requirements: {
            kind: "shiftType",
            counts: { late: { [kitchen]: 1, [hall]: 3 }, early: { [hall]: 2 }, removed: { [hall]: 5 } },
          },
        }),
      ],
      { positions, pattern: shiftTypePattern },
    );

    expect(input.requirements).toEqual({
      kind: "shiftType",
      options: [
        { optionId: "early", counts: [{ positionId: hall, count: 2 }] },
        {
          optionId: "late",
          counts: [
            { positionId: hall, count: 3 },
            { positionId: kitchen, count: 1 },
          ],
        },
      ],
    });
  });
});

describe("変更の有無の判定", () => {
  const saved = [
    savedTemplate({
      requirements: {
        kind: "time",
        bars: [
          { positionId: hall, startTime: "09:00", endTime: "22:00" },
          { positionId: hall, startTime: "11:00", endTime: "14:00" },
        ],
      },
    }),
  ];
  const savedDrafts = toDayTemplateDrafts(saved);
  const savedInputs = toDayTemplateInputs(savedDrafts, timeContext);
  const [savedDraft] = savedDrafts;
  const savedBars = savedDraft.requirements.kind === "time" ? savedDraft.requirements.bars : [];

  it("保存済みの型をそのまま直した値は、保存内容として同じとみなす", () => {
    expect(isSameDayTemplateInputs(toDayTemplateInputs(savedDrafts, timeContext), savedInputs)).toBe(true);
  });

  it("バーのidと並びだけが違う値は、保存内容として同じとみなす", () => {
    const reordered = changeDayTemplateBars(savedDrafts, templateId, [
      { ...savedBars[1], id: "bar-9" },
      { ...savedBars[0], id: "bar-8" },
    ]);

    expect(isSameDayTemplateInputs(toDayTemplateInputs(reordered, timeContext), savedInputs)).toBe(true);
  });

  it.each([
    ["バーを1本足す", changeDayTemplateBars(savedDrafts, templateId, [...savedBars, { ...savedBars[1], id: "bar-3" }])],
    [
      "バーの終了を変える",
      changeDayTemplateBars(savedDrafts, templateId, [savedBars[0], { ...savedBars[1], end: "15:00" }]),
    ],
    ["名前を変える", renameDayTemplate(savedDrafts, templateId, "平日昼")],
    ["曜日を外す", toggleDayTemplateWeekday(savedDrafts, templateId, "tue")],
    ["祝日を選ぶ", toggleDayTemplateHoliday(savedDrafts, templateId)],
    ["型を削除する", removeDayTemplate(savedDrafts, templateId)],
  ])("%sと、保存内容が変わる", (_, changed) => {
    expect(isSameDayTemplateInputs(toDayTemplateInputs(changed, timeContext), savedInputs)).toBe(false);
  });
});

describe("新しく足す型の初期値", () => {
  it("最初の型は「通常」で、定休日を除くすべての曜日を持ち、祝日は選ばない", () => {
    expect(
      createDayTemplateDraft({ drafts: [], pattern: timePattern, regularClosedDays: ["wed"], rowKey: "new-1" }),
    ).toEqual({
      rowKey: "new-1",
      name: "通常",
      weekdays: ["sun", "mon", "tue", "thu", "fri", "sat"],
      appliesToHolidays: false,
      requirements: { kind: "time", bars: [] },
      requiresReentry: false,
    });
  });

  it("2つ目以降は、まだ割り当てていない営業日と、重ならない名前を初期値にする", () => {
    const drafts = [
      draft({ rowKey: "a", name: "平日", weekdays: ["mon", "tue", "thu", "fri"] }),
      draft({ rowKey: "b", name: "型3", weekdays: [] }),
    ];

    const added = createDayTemplateDraft({ drafts, pattern: timePattern, regularClosedDays: ["wed"], rowKey: "new-1" });

    expect(added.name).toBe("型4");
    expect(added.weekdays).toEqual(["sun", "sat"]);
  });

  it.each([
    [shiftTypePattern, { kind: "shiftType", counts: {} }],
    [dateOnlyPattern, { kind: "dateOnly", counts: {} }],
  ] as const)("必要人数は、集め方に合う空の形で始める", (pattern, requirements) => {
    expect(
      createDayTemplateDraft({ drafts: [], pattern, regularClosedDays: [], rowKey: "new-1" }).requirements,
    ).toEqual(requirements);
  });

  it("どの型にも割り当てていない曜日を返す", () => {
    expect(
      getUnassignedWeekdays([draft({ weekdays: ["mon", "tue", "wed", "thu"] }), draft({ weekdays: ["sat"] })]),
    ).toEqual(["sun", "fri"]);
  });
});

describe("型の名前と削除", () => {
  const drafts = [draft({ rowKey: "a", name: "平日" }), draft({ rowKey: "b", name: "土日", weekdays: ["sat"] })];

  it("名前を変えても、ほかの型と行の識別子は変わらない", () => {
    expect(renameDayTemplate(drafts, "b", "週末").map((item) => [item.rowKey, item.name])).toEqual([
      ["a", "平日"],
      ["b", "週末"],
    ]);
  });

  it("削除すると、その型だけがなくなる", () => {
    expect(removeDayTemplate(drafts, "a").map((item) => item.rowKey)).toEqual(["b"]);
  });

  it("名前が空の型は「名前のない型」と呼ぶ", () => {
    expect(getDayTemplateLabel({ name: "  " })).toBe("名前のない型");
    expect(getDayTemplateLabel({ name: " 祝日 " })).toBe("祝日");
  });
});

describe("編集する型の選択", () => {
  const drafts = [draft({ rowKey: "a" }), draft({ rowKey: "b" }), draft({ rowKey: "c" })];

  it("選んだ型が一覧にあれば、その型を返す", () => {
    expect(resolveSelectedDayTemplate(drafts, { rowKey: "b", index: 0 })?.rowKey).toBe("b");
  });

  it("何も選んでいなければ、先頭の型を返す", () => {
    expect(resolveSelectedDayTemplate(drafts, { rowKey: null, index: 0 })?.rowKey).toBe("a");
  });

  it("途中の型を削除したあとは、すぐ下にあった型へ移る", () => {
    expect(resolveSelectedDayTemplate(removeDayTemplate(drafts, "b"), { rowKey: null, index: 1 })?.rowKey).toBe("c");
  });

  it("最後の型を削除したあとは、すぐ上の型へ移る", () => {
    expect(resolveSelectedDayTemplate(removeDayTemplate(drafts, "c"), { rowKey: null, index: 2 })?.rowKey).toBe("b");
  });

  it("保存して識別子が変わっても、同じ位置の型を選んだままにする", () => {
    const saved = [draft({ rowKey: "a" }), draft({ rowKey: "b" }), draft({ rowKey: "template-added" })];

    expect(resolveSelectedDayTemplate(saved, { rowKey: "new-1", index: 2 })?.rowKey).toBe("template-added");
  });

  it("型が1つもなければnullを返す", () => {
    expect(resolveSelectedDayTemplate([], { rowKey: "a", index: 0 })).toBeNull();
  });
});

describe("曜日と祝日の割り当て", () => {
  const drafts = [
    draft({ rowKey: "a", weekdays: ["mon", "tue"], appliesToHolidays: true }),
    draft({ rowKey: "b", name: "土日", weekdays: ["sat"] }),
  ];
  const weekdaysOf = (list: DayTemplateDraft[]) => list.map((item) => item.weekdays);
  const holidaysOf = (list: DayTemplateDraft[]) => list.map((item) => item.appliesToHolidays);

  it("割り当てていない曜日を押すと、その型に入る", () => {
    expect(weekdaysOf(toggleDayTemplateWeekday(drafts, "b", "sun"))).toEqual([
      ["mon", "tue"],
      ["sat", "sun"],
    ]);
  });

  it("別の型が持つ曜日を押すと、その型から外して移す", () => {
    expect(weekdaysOf(toggleDayTemplateWeekday(drafts, "b", "tue"))).toEqual([["mon"], ["sat", "tue"]]);
  });

  it("選んでいる曜日を押すと外れ、どの型にも入らない曜日になる", () => {
    expect(weekdaysOf(toggleDayTemplateWeekday(drafts, "a", "mon"))).toEqual([["tue"], ["sat"]]);
  });

  it("別の型が祝日を持っていたら、その型から外して移す", () => {
    expect(holidaysOf(toggleDayTemplateHoliday(drafts, "b"))).toEqual([false, true]);
  });

  it("選んでいる祝日を押すと外れ、祝日に使う型がなくなる", () => {
    expect(holidaysOf(toggleDayTemplateHoliday(drafts, "a"))).toEqual([false, false]);
  });

  it("曜日と祝日を切り替えても、必要人数は変わらない", () => {
    const moved = toggleDayTemplateHoliday(toggleDayTemplateWeekday(drafts, "b", "tue"), "b");

    expect(moved.map((item) => item.requirements)).toEqual(drafts.map((item) => item.requirements));
  });
});

describe("数字で入れる必要人数", () => {
  const shiftTypeDraft = draft({ requirements: { kind: "shiftType", counts: { early: { [hall]: 2 } } } });
  const dateOnlyDraft = draft({ requirements: { kind: "dateOnly", counts: { [hall]: 4 } } });
  const change = (target: DayTemplateDraft, rowId: string, positionId: string, count: number) =>
    changeRequiredCount([target], "a", { rowId, positionId, count })[0].requirements;

  it("パターン選択は、勤務パターンとポジションのマスへ人数を入れる", () => {
    expect(change(shiftTypeDraft, "late", kitchen, 3)).toEqual({
      kind: "shiftType",
      counts: { early: { [hall]: 2 }, late: { [kitchen]: 3 } },
    });
  });

  it("0人にしたマスは持たず、人数のなくなった勤務パターンも持たない", () => {
    expect(change(shiftTypeDraft, "early", hall, 0)).toEqual({ kind: "shiftType", counts: {} });
  });

  it("日付選択は、ポジションごとの人数を変える", () => {
    expect(change(dateOnlyDraft, ALL_DAY_ROW_ID, kitchen, 2)).toEqual({
      kind: "dateOnly",
      counts: { [hall]: 4, [kitchen]: 2 },
    });
    expect(change(dateOnlyDraft, ALL_DAY_ROW_ID, hall, 0)).toEqual({ kind: "dateOnly", counts: {} });
  });

  it.each([
    [SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX, SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX],
    [SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX + 1, SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX],
    [2.9, 2],
  ])("人数%dは、上限までの整数%dに収める", (count, expected) => {
    expect(change(dateOnlyDraft, ALL_DAY_ROW_ID, hall, count)).toEqual({
      kind: "dateOnly",
      counts: { [hall]: expected },
    });
  });

  it.each([[-1], [Number.NaN]])("人数%dは、未設定として扱う", (count) => {
    expect(change(dateOnlyDraft, ALL_DAY_ROW_ID, hall, count)).toEqual({ kind: "dateOnly", counts: {} });
  });

  it("時間指定の型は、数字の入力で変わらない", () => {
    const timeDraft = draft();

    expect(change(timeDraft, "early", hall, 3)).toEqual(timeDraft.requirements);
  });

  it("表の行は、パターン選択が勤務パターンの名前と時刻、日付選択が「1日」の1行になる", () => {
    expect(getRequiredCountRows(shiftTypePattern)).toEqual([
      { id: "early", label: "早番", detail: "09:00〜15:00" },
      { id: "late", label: "遅番", detail: "15:00〜22:00" },
    ]);
    expect(getRequiredCountRows(dateOnlyPattern)).toEqual([{ id: ALL_DAY_ROW_ID, label: "1日" }]);
    expect(getRequiredCountRows(timePattern)).toEqual([]);
  });

  it("表へ渡す人数は、行のIDからポジションごとの人数を引ける形にする", () => {
    expect(getRequiredCountTableCounts(shiftTypeDraft.requirements)).toEqual({ early: { [hall]: 2 } });
    expect(getRequiredCountTableCounts(dateOnlyDraft.requirements)).toEqual({ [ALL_DAY_ROW_ID]: { [hall]: 4 } });
  });
});

describe("バーの置き換え", () => {
  it("時間指定の型のバーを、渡したバーで置き換える", () => {
    const bars = toEditableStaffingBars([bar(kitchen, "17:00", "21:00")]);

    expect(changeDayTemplateBars([draft()], "a", bars)[0].requirements).toEqual({ kind: "time", bars });
  });

  it("時間指定でない型は変えない", () => {
    const dateOnlyDraft = draft({ requirements: { kind: "dateOnly", counts: { [hall]: 1 } } });

    expect(changeDayTemplateBars([dateOnlyDraft], "a", [])[0]).toEqual(dateOnlyDraft);
  });

  it("バーを置ける範囲は、時間指定の受付時間を分で返す。ほかの集め方ではnullを返す", () => {
    expect(getStaffingBarRange(timePattern)).toEqual({ startMinutes: 540, endMinutes: 1320 });
    expect(getStaffingBarRange(shiftTypePattern)).toBeNull();
    expect(getStaffingBarRange(dateOnlyPattern)).toBeNull();
  });
});

describe("ほかの型からコピー", () => {
  it("コピー元のバーで置き換え、名前と使う日は変えない。コピー元は変わらない", () => {
    const source = draft({
      rowKey: "a",
      requirements: timeRequirements(bar(hall, "09:00", "22:00"), bar(kitchen, "11:00", "14:00")),
    });
    const target = draft({
      rowKey: "b",
      name: "祝日",
      weekdays: [],
      appliesToHolidays: true,
      requirements: timeRequirements(bar(hall, "10:00", "12:00")),
    });

    const [copiedSource, copiedTarget] = copyDayTemplateRequirements([source, target], {
      fromRowKey: "a",
      toRowKey: "b",
    });

    expect(copiedSource).toEqual(source);
    expect(copiedTarget).toEqual({ ...target, requirements: source.requirements });
  });

  it("写したあとにコピー先の人数を変えても、コピー元は変わらない", () => {
    const source = draft({ rowKey: "a", requirements: { kind: "shiftType", counts: { early: { [hall]: 2 } } } });
    const target = draft({ rowKey: "b", requirements: { kind: "shiftType", counts: {} } });

    const copied = copyDayTemplateRequirements([source, target], { fromRowKey: "a", toRowKey: "b" });
    const changed = changeRequiredCount(copied, "b", { rowId: "early", positionId: hall, count: 5 });

    expect(changed.map((item) => item.requirements)).toEqual([
      { kind: "shiftType", counts: { early: { [hall]: 2 } } },
      { kind: "shiftType", counts: { early: { [hall]: 5 } } },
    ]);
  });

  it("コピー元が見つからない場合と、同じ型を指した場合は変えない", () => {
    const drafts = [draft({ rowKey: "a" }), draft({ rowKey: "b", requirements: timeRequirements() })];

    expect(copyDayTemplateRequirements(drafts, { fromRowKey: "missing", toRowKey: "b" })).toEqual(drafts);
    expect(copyDayTemplateRequirements(drafts, { fromRowKey: "a", toRowKey: "a" })).toEqual(drafts);
  });
});

describe("型ごとの入力の誤り", () => {
  const issuesOf = (drafts: DayTemplateDraft[], pattern: ShiftSetupSubmissionPattern = timePattern) =>
    findDayTemplateDraftIssues(drafts, { positions, pattern });

  it("誤りのない一覧では空を返す", () => {
    expect(
      issuesOf([
        draft({ rowKey: "a", appliesToHolidays: true }),
        draft({ rowKey: "b", name: "土日", weekdays: ["sat", "sun"] }),
      ]),
    ).toEqual({});
  });

  it("空の名前と、受付時間の外に出たバーは、その型の誤りとして返す", () => {
    expect(
      issuesOf([
        draft({ rowKey: "a", name: "  " }),
        draft({ rowKey: "b", name: "土日", weekdays: ["sat"] }),
        draft({
          rowKey: "c",
          name: "祝日",
          weekdays: [],
          requirements: timeRequirements(bar(hall, "08:00", "12:00")),
        }),
      ]),
    ).toEqual({ a: "NAME_REQUIRED", c: "BAR_OUT_OF_RANGE" });
  });

  it("受付時間の外に出たバーは、切りそろえると誤りでなくなる", () => {
    const outside = toEditableStaffingBars([bar(hall, "08:00", "12:00"), bar(hall, "07:00", "09:00")]);
    const trimmed = trimBarsToRange({ bars: outside, range: { startMinutes: 540, endMinutes: 1320 }, unitMinutes: 30 });
    const [target] = changeDayTemplateBars([draft()], "a", trimmed);

    expect(issuesOf([target])).toEqual({});
    expect(toDayTemplateInputs([target], timeContext)[0].requirements).toEqual({
      kind: "time",
      bars: [{ positionId: hall, startTime: "09:00", endTime: "12:00" }],
    });
  });

  it("同じ時間に重なるバーが1ポジションで10本を超える型を、誤りとして返す", () => {
    const tenBars = Array.from({ length: 10 }, () => bar(hall, "11:00", "14:00"));

    expect(issuesOf([draft({ requirements: timeRequirements(...tenBars) })])).toEqual({});
    expect(issuesOf([draft({ requirements: timeRequirements(...tenBars, bar(hall, "13:30", "15:00")) })])).toEqual({
      a: "BAR_CONCURRENT_LIMIT",
    });
  });

  it("名前、曜日、祝日の重複は、あとから出てくる型の誤りとして返す", () => {
    expect(
      issuesOf([
        draft({ rowKey: "a", name: "平日", weekdays: ["mon"], appliesToHolidays: true }),
        draft({ rowKey: "b", name: " 平日 ", weekdays: ["tue"] }),
        draft({ rowKey: "c", name: "月曜", weekdays: ["mon"] }),
        draft({ rowKey: "d", name: "祝日", weekdays: [], appliesToHolidays: true }),
      ]),
    ).toEqual({ b: "NAME_DUPLICATED", c: "WEEKDAY_DUPLICATED", d: "HOLIDAY_DUPLICATED" });
  });

  it("いまの集め方と種類が違う必要人数を、誤りとして返す", () => {
    expect(issuesOf([draft()], dateOnlyPattern)).toEqual({ a: "REQUIREMENTS_KIND_MISMATCH" });
  });

  it("型は20件まで誤りにならず、21件で一覧全体の誤りになる", () => {
    const build = (length: number) =>
      toDayTemplateInputs(
        Array.from({ length }, (_, index) => draft({ rowKey: `row-${index}`, name: `型${index}`, weekdays: [] })),
        timeContext,
      );

    expect(findDayTemplateInputsIssue(build(SHIFT_DAY_TEMPLATE_LIMIT), timePattern)).toBeNull();
    expect(findDayTemplateInputsIssue(build(SHIFT_DAY_TEMPLATE_LIMIT + 1), timePattern)).toBe("TEMPLATE_LIMIT");
  });
});

describe("型を使う日の要約", () => {
  it.each([
    [["mon", "tue", "wed", "thu", "fri"], false, "月〜金"],
    [["sat", "sun"], false, "土・日"],
    [["sun", "mon", "thu", "fri", "sat"], false, "月・木〜日"],
    [["mon", "tue", "thu", "fri"], false, "月・火・木・金"],
    [["mon", "wed", "fri"], false, "月・水・金"],
    [["sun", "mon", "tue", "wed", "thu", "fri", "sat"], false, "毎日"],
    [["sat", "sun"], true, "土・日・祝日"],
    [[], true, "祝日"],
    [[], false, "個別に当てる"],
  ] as const)("曜日%jと祝日%sは「%s」と表す", (weekdays, appliesToHolidays, expected) => {
    expect(formatDayTemplateUsage({ weekdays: [...weekdays], appliesToHolidays })).toBe(expected);
  });
});

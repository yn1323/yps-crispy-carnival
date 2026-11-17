import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "@/convex/constants";
import {
  barsToStaffingSegments,
  type StaffingSegment,
  setStaffingCount,
  trimSegmentsToRange,
} from "@/src/domains/shift/staffingSegments";
import { timeToMinutes } from "@/src/domains/shift/time";
import {
  ALL_DAY_ROW_ID,
  changeDayTemplateSegments,
  changeRequiredCount,
  clearDayTemplateWeekdays,
  copyDayTemplateRequirements,
  createDayTemplateDraft,
  findDayTemplateDraftIssues,
  findDayTemplateInputsIssue,
  formatDayTemplateUsage,
  getDayTemplateLabel,
  getRequiredCountRows,
  getRequiredCountTableCounts,
  getStaffingSegmentRange,
  getUnassignedWeekdays,
  hasPendingDayTemplateChanges,
  isSameDayTemplateInputs,
  isUntouchedNewDayTemplate,
  needsDayTemplateReentry,
  removeDayTemplate,
  renameDayTemplate,
  reorderDayTemplates,
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

const seg = (positionId: string, startTime: string, endTime: string, count: number): StaffingSegment => ({
  positionId,
  startTime,
  endTime,
  count,
});

/** 重ねたバーの本数から、編集中の人数の区間を作る。 */
function timeRequirements(...bars: ReturnType<typeof bar>[]): DayTemplateRequirementsDraft {
  return { kind: "time", segments: barsToStaffingSegments(bars) };
}

/** 編集中のテンプレートの、1つの範囲の人数を置き換える。 */
function setCount(
  drafts: readonly DayTemplateDraft[],
  rowKey: string,
  range: { positionId: string; start: string; end: string; count: number },
) {
  const target = drafts.find((item) => item.rowKey === rowKey);
  const segments = target?.requirements.kind === "time" ? target.requirements.segments : [];
  return changeDayTemplateSegments(
    drafts,
    rowKey,
    setStaffingCount({
      segments,
      positionId: range.positionId,
      startMinutes: timeToMinutes(range.start),
      endMinutes: timeToMinutes(range.end),
      count: range.count,
    }),
  );
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

describe("保存済みのテンプレートを編集中の形へ直す", () => {
  it("時間指定は、重なったバーの本数を、時間ごとの人数の区間にする。受付時間の外の人数も残す", () => {
    const [converted] = toDayTemplateDrafts([
      savedTemplate({
        appliesToHolidays: true,
        requirements: {
          kind: "time",
          bars: [
            { positionId: hall, startTime: "07:00", endTime: "10:00" },
            { positionId: hall, startTime: "11:00", endTime: "14:00" },
            { positionId: hall, startTime: "11:00", endTime: "13:00" },
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
        segments: [
          seg(hall, "07:00", "10:00", 1),
          seg(hall, "11:00", "13:00", 2),
          seg(hall, "13:00", "14:00", 1),
          seg(kitchen, "11:00", "14:00", 1),
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

  it("集め方を変えたあとのテンプレートは、空の必要人数と、入れ直しの印を持つ", () => {
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

  it("AIの下書きは、idを持たない新しいテンプレートになり、時間ごとの人数の区間で入る", () => {
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
          segments: [seg(hall, "09:00", "11:00", 1), seg(hall, "11:00", "14:00", 2), seg(hall, "14:00", "22:00", 1)],
        },
        requiresReentry: false,
      },
    ]);
  });
});

describe("保存する形への変換", () => {
  it("行の識別子を外し、曜日は日曜から、人数をバーへ変えて開始・終了・ポジションの順に並べる", () => {
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

  it("人数の分だけバーを重ね、同じ人数以上が続く時間は1本のバーにつなげて送る", () => {
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
      // 10:00〜14:00 が2人、14:00〜18:00 が1人。1人目の層は 10:00〜18:00 の1本になる。
      bars: [
        { positionId: hall, startTime: "10:00", endTime: "14:00" },
        { positionId: hall, startTime: "10:00", endTime: "18:00" },
      ],
    });
  });

  it("いまは無いポジションの人数は送らない", () => {
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

  it("保存済みのテンプレートをそのまま直した値は、保存内容として同じとみなす", () => {
    expect(isSameDayTemplateInputs(toDayTemplateInputs(savedDrafts, timeContext), savedInputs)).toBe(true);
  });

  it("バーの置き方が違っても、時間ごとの人数が同じなら、保存内容として同じとみなす", () => {
    // 09:00〜14:00 と 11:00〜22:00 の2本。人数は、通しの1本に昼の1本を重ねた保存済みのテンプレートと同じになる。
    const staggered = toDayTemplateDrafts([
      savedTemplate({
        requirements: {
          kind: "time",
          bars: [
            { positionId: hall, startTime: "11:00", endTime: "22:00" },
            { positionId: hall, startTime: "09:00", endTime: "14:00" },
          ],
        },
      }),
    ]);

    expect(isSameDayTemplateInputs(toDayTemplateInputs(staggered, timeContext), savedInputs)).toBe(true);
    expect(hasPendingDayTemplateChanges(staggered, savedInputs, timeContext)).toBe(false);
  });

  it("人数を入れてから元の人数に戻すと、保存内容として同じに戻る", () => {
    const changed = setCount(savedDrafts, templateId, { positionId: hall, start: "15:00", end: "17:00", count: 4 });
    const restored = setCount(changed, templateId, { positionId: hall, start: "15:00", end: "17:00", count: 1 });

    expect(hasPendingDayTemplateChanges(changed, savedInputs, timeContext)).toBe(true);
    expect(hasPendingDayTemplateChanges(restored, savedInputs, timeContext)).toBe(false);
  });

  it.each([
    ["人数を増やす", setCount(savedDrafts, templateId, { positionId: hall, start: "11:00", end: "14:00", count: 3 })],
    [
      "人数の多い時間を延ばす",
      setCount(savedDrafts, templateId, { positionId: hall, start: "14:00", end: "15:00", count: 2 }),
    ],
    ["人数を消す", setCount(savedDrafts, templateId, { positionId: hall, start: "09:00", end: "10:00", count: 0 })],
    ["名前を変える", renameDayTemplate(savedDrafts, templateId, "平日昼")],
    ["曜日を外す", toggleDayTemplateWeekday(savedDrafts, templateId, "tue")],
    ["祝日を選ぶ", toggleDayTemplateHoliday(savedDrafts, templateId)],
    ["テンプレートを削除する", removeDayTemplate(savedDrafts, templateId)],
  ])("%sと、保存内容が変わる", (_, changed) => {
    expect(isSameDayTemplateInputs(toDayTemplateInputs(changed, timeContext), savedInputs)).toBe(false);
  });
});

describe("新しく足すテンプレートの初期値", () => {
  it("最初のテンプレートは「通常」で、定休日を除くすべての曜日を持ち、祝日は選ばない", () => {
    expect(
      createDayTemplateDraft({ drafts: [], pattern: timePattern, regularClosedDays: ["wed"], rowKey: "new-1" }),
    ).toEqual({
      rowKey: "new-1",
      name: "通常",
      weekdays: ["sun", "mon", "tue", "thu", "fri", "sat"],
      appliesToHolidays: false,
      requirements: { kind: "time", segments: [] },
      requiresReentry: false,
      // 作ったときの名前と曜日を控え、何も入れていないテンプレートかを見分ける。
      initial: { name: "通常", weekdays: ["sun", "mon", "tue", "thu", "fri", "sat"] },
    });
  });

  it("2つ目以降は、まだ割り当てていない営業日と、重ならない名前を初期値にする", () => {
    const drafts = [
      draft({ rowKey: "a", name: "平日", weekdays: ["mon", "tue", "thu", "fri"] }),
      draft({ rowKey: "b", name: "テンプレート3", weekdays: [] }),
    ];

    const added = createDayTemplateDraft({ drafts, pattern: timePattern, regularClosedDays: ["wed"], rowKey: "new-1" });

    expect(added.name).toBe("テンプレート4");
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

  it("どのテンプレートにも割り当てていない曜日を返す", () => {
    expect(
      getUnassignedWeekdays([draft({ weekdays: ["mon", "tue", "wed", "thu"] }), draft({ weekdays: ["sat"] })]),
    ).toEqual(["sun", "fri"]);
  });
});

describe("作ったまま何も入れていない新しいテンプレート", () => {
  const saved = [
    savedTemplate({
      requirements: { kind: "time", bars: [{ positionId: hall, startTime: "09:00", endTime: "22:00" }] },
    }),
  ];
  const savedDrafts = toDayTemplateDrafts(saved);
  const savedInputs = toDayTemplateInputs(savedDrafts, timeContext);
  const added = createDayTemplateDraft({
    drafts: savedDrafts,
    pattern: timePattern,
    regularClosedDays: ["wed"],
    rowKey: "new-1",
  });
  const withAdded = [...savedDrafts, added];

  it("足したままのテンプレートは、何も入れていないテンプレートで、保存していない変更に数えない", () => {
    expect(isUntouchedNewDayTemplate(added)).toBe(true);
    expect(hasPendingDayTemplateChanges(withAdded, savedInputs, timeContext)).toBe(false);
    // 保存する内容としては、テンプレートが1つ増えている。
    expect(isSameDayTemplateInputs(toDayTemplateInputs(withAdded, timeContext), savedInputs)).toBe(false);
  });

  it("最初のテンプレートを作っただけのときも、保存していない変更に数えない", () => {
    const first = createDayTemplateDraft({ drafts: [], pattern: timePattern, regularClosedDays: [], rowKey: "new-1" });

    expect(hasPendingDayTemplateChanges([first], [], timeContext)).toBe(false);
  });

  it.each([
    ["名前を変える", renameDayTemplate(withAdded, "new-1", "土日")],
    ["名前の末尾に空白を足す", renameDayTemplate(withAdded, "new-1", `${added.name} `)],
    ["曜日を外す", toggleDayTemplateWeekday(withAdded, "new-1", "sat")],
    ["別のテンプレートと同じ曜日を選ぶ", toggleDayTemplateWeekday(withAdded, "new-1", "mon")],
    ["曜日を指定しない", clearDayTemplateWeekdays(withAdded, "new-1")],
    ["祝日を選ぶ", toggleDayTemplateHoliday(withAdded, "new-1")],
    ["人数を入れる", changeDayTemplateSegments(withAdded, "new-1", [seg(hall, "10:00", "15:00", 1)])],
    ["コピーする", copyDayTemplateRequirements(withAdded, { fromRowKey: templateId, toRowKey: "new-1" })],
  ])("足したテンプレートで%sと、保存していない変更に数える", (_, changed) => {
    expect(isUntouchedNewDayTemplate(changed[1])).toBe(false);
    expect(hasPendingDayTemplateChanges(changed, savedInputs, timeContext)).toBe(true);
  });

  it.each([
    [shiftTypePattern, { rowId: "early", positionId: hall, count: 2 }],
    [dateOnlyPattern, { rowId: ALL_DAY_ROW_ID, positionId: hall, count: 2 }],
  ] as const)("数字で入れるテンプレートは、人数を入れると変更に数え、0へ戻すと数えない", (pattern, change) => {
    const first = createDayTemplateDraft({ drafts: [], pattern, regularClosedDays: [], rowKey: "new-1" });
    const context = { positions, pattern };
    const entered = changeRequiredCount([first], "new-1", change);

    expect(hasPendingDayTemplateChanges(entered, [], context)).toBe(true);
    expect(
      hasPendingDayTemplateChanges(changeRequiredCount(entered, "new-1", { ...change, count: 0 }), [], context),
    ).toBe(false);
  });

  it("変えた名前と曜日を作ったときの値へ戻すと、何も入れていないテンプレートへ戻る", () => {
    const renamed = renameDayTemplate(withAdded, "new-1", "土日");
    const toggled = toggleDayTemplateWeekday(renamed, "new-1", "sat");
    expect(isUntouchedNewDayTemplate(toggled[1])).toBe(false);

    const restored = toggleDayTemplateWeekday(renameDayTemplate(toggled, "new-1", added.name), "new-1", "sat");

    expect(isUntouchedNewDayTemplate(restored[1])).toBe(true);
    expect(hasPendingDayTemplateChanges(restored, savedInputs, timeContext)).toBe(false);
  });

  it("足したテンプレートが何も入れていなくても、保存済みのテンプレートを変えていれば変更に数える", () => {
    const changed = renameDayTemplate(withAdded, templateId, "平日昼");

    expect(isUntouchedNewDayTemplate(changed[1])).toBe(true);
    expect(hasPendingDayTemplateChanges(changed, savedInputs, timeContext)).toBe(true);
  });

  it("保存済みのテンプレートとAIの下書きは、何も入れていない新しいテンプレートとして扱わない", () => {
    const emptySaved = toDayTemplateDrafts([savedTemplate()]);
    const suggested = toDayTemplateDraftsFromSuggestion(
      [{ name: "通常", weekdays: ["mon"], appliesToHolidays: false, requirements: { kind: "time", bars: [] } }],
      () => "new-1",
    );

    expect(isUntouchedNewDayTemplate(emptySaved[0])).toBe(false);
    expect(isUntouchedNewDayTemplate(suggested[0])).toBe(false);
    expect(hasPendingDayTemplateChanges(suggested, [], timeContext)).toBe(true);
  });
});

describe("テンプレートの名前と削除", () => {
  const drafts = [draft({ rowKey: "a", name: "平日" }), draft({ rowKey: "b", name: "土日", weekdays: ["sat"] })];

  it("名前を変えても、ほかのテンプレートと行の識別子は変わらない", () => {
    expect(renameDayTemplate(drafts, "b", "週末").map((item) => [item.rowKey, item.name])).toEqual([
      ["a", "平日"],
      ["b", "週末"],
    ]);
  });

  it("削除すると、そのテンプレートだけがなくなる", () => {
    expect(removeDayTemplate(drafts, "a").map((item) => item.rowKey)).toEqual(["b"]);
  });

  it("つかんだテンプレートを重ねた位置へ動かし、並びが変わると保存内容も変わる", () => {
    const three = [...drafts, draft({ rowKey: "c", name: "祝日", weekdays: [], appliesToHolidays: true })];
    const keys = (items: readonly { rowKey: string }[]) => items.map((item) => item.rowKey);

    expect(keys(reorderDayTemplates(three, "c", "a"))).toEqual(["c", "a", "b"]);
    expect(keys(reorderDayTemplates(three, "a", "c"))).toEqual(["b", "c", "a"]);
    // 同じ位置へ重ねた場合と、一覧にないテンプレートは、並びを変えない。
    expect(keys(reorderDayTemplates(three, "b", "b"))).toEqual(["a", "b", "c"]);
    expect(keys(reorderDayTemplates(three, "unknown", "a"))).toEqual(["a", "b", "c"]);

    const saved = toDayTemplateInputs(three, timeContext);
    expect(isSameDayTemplateInputs(toDayTemplateInputs(reorderDayTemplates(three, "c", "a"), timeContext), saved)).toBe(
      false,
    );
  });

  it("名前が空のテンプレートは「名前のないテンプレート」と呼ぶ", () => {
    expect(getDayTemplateLabel({ name: "  " })).toBe("名前のないテンプレート");
    expect(getDayTemplateLabel({ name: " 祝日 " })).toBe("祝日");
  });
});

describe("編集するテンプレートの選択", () => {
  const drafts = [draft({ rowKey: "a" }), draft({ rowKey: "b" }), draft({ rowKey: "c" })];

  it("選んだテンプレートが一覧にあれば、そのテンプレートを返す", () => {
    expect(resolveSelectedDayTemplate(drafts, { rowKey: "b", index: 0 })?.rowKey).toBe("b");
  });

  it("何も選んでいなければ、先頭のテンプレートを返す", () => {
    expect(resolveSelectedDayTemplate(drafts, { rowKey: null, index: 0 })?.rowKey).toBe("a");
  });

  it("途中のテンプレートを削除したあとは、すぐ下にあったテンプレートへ移る", () => {
    expect(resolveSelectedDayTemplate(removeDayTemplate(drafts, "b"), { rowKey: null, index: 1 })?.rowKey).toBe("c");
  });

  it("最後のテンプレートを削除したあとは、すぐ上のテンプレートへ移る", () => {
    expect(resolveSelectedDayTemplate(removeDayTemplate(drafts, "c"), { rowKey: null, index: 2 })?.rowKey).toBe("b");
  });

  it("保存して識別子が変わっても、同じ位置のテンプレートを選んだままにする", () => {
    const saved = [draft({ rowKey: "a" }), draft({ rowKey: "b" }), draft({ rowKey: "template-added" })];

    expect(resolveSelectedDayTemplate(saved, { rowKey: "new-1", index: 2 })?.rowKey).toBe("template-added");
  });

  it("テンプレートが1つもなければnullを返す", () => {
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

  it("割り当てていない曜日を押すと、そのテンプレートに入る", () => {
    expect(weekdaysOf(toggleDayTemplateWeekday(drafts, "b", "sun"))).toEqual([
      ["mon", "tue"],
      ["sat", "sun"],
    ]);
  });

  it("別のテンプレートが持つ曜日を押しても、そのテンプレートからは外さない", () => {
    expect(weekdaysOf(toggleDayTemplateWeekday(drafts, "b", "tue"))).toEqual([
      ["mon", "tue"],
      ["sat", "tue"],
    ]);
  });

  it("選んでいる曜日を押すと外れ、どのテンプレートにも入らない曜日になる", () => {
    expect(weekdaysOf(toggleDayTemplateWeekday(drafts, "a", "mon"))).toEqual([["tue"], ["sat"]]);
  });

  it("別のテンプレートが祝日を持っていても、そのテンプレートからは外さない", () => {
    expect(holidaysOf(toggleDayTemplateHoliday(drafts, "b"))).toEqual([true, true]);
  });

  it("曜日を指定しないと、そのテンプレートの曜日だけをすべて外し、祝日とほかのテンプレートは変えない", () => {
    const cleared = clearDayTemplateWeekdays(drafts, "a");

    expect(weekdaysOf(cleared)).toEqual([[], ["sat"]]);
    expect(holidaysOf(cleared)).toEqual([true, false]);
  });

  it("曜日を選んでいないテンプレートで指定しないを押しても、何も変えない", () => {
    const cleared = clearDayTemplateWeekdays(drafts, "a");

    expect(clearDayTemplateWeekdays(cleared, "a")[0]).toBe(cleared[0]);
  });

  it("選んでいる祝日を押すと外れ、祝日に使うテンプレートがなくなる", () => {
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

  it("時間指定のテンプレートは、数字の入力で変わらない", () => {
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

describe("人数の区間の置き換え", () => {
  it("時間指定のテンプレートの人数を、渡した区間で置き換える。区間は正規化して持つ", () => {
    const [changed] = changeDayTemplateSegments([draft()], "a", [
      seg(kitchen, "19:00", "21:00", 2),
      seg(kitchen, "17:00", "19:00", 2),
      seg(hall, "11:00", "14:00", 3),
    ]);

    expect(changed.requirements).toEqual({
      kind: "time",
      segments: [seg(hall, "11:00", "14:00", 3), seg(kitchen, "17:00", "21:00", 2)],
    });
  });

  it("時間指定でないテンプレートは変えない", () => {
    const dateOnlyDraft = draft({ requirements: { kind: "dateOnly", counts: { [hall]: 1 } } });

    expect(changeDayTemplateSegments([dateOnlyDraft], "a", [])[0]).toEqual(dateOnlyDraft);
  });

  it("人数を入れられる範囲は、時間指定の受付時間を分で返す。ほかの集め方ではnullを返す", () => {
    expect(getStaffingSegmentRange(timePattern)).toEqual({ startMinutes: 540, endMinutes: 1320 });
    expect(getStaffingSegmentRange(shiftTypePattern)).toBeNull();
    expect(getStaffingSegmentRange(dateOnlyPattern)).toBeNull();
  });
});

describe("コピーする", () => {
  it("コピー元の人数で置き換え、名前と使う日は変えない。コピー元は変わらない", () => {
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

  it("コピー元が見つからない場合と、同じテンプレートを指した場合は変えない", () => {
    const drafts = [draft({ rowKey: "a" }), draft({ rowKey: "b", requirements: timeRequirements() })];

    expect(copyDayTemplateRequirements(drafts, { fromRowKey: "missing", toRowKey: "b" })).toEqual(drafts);
    expect(copyDayTemplateRequirements(drafts, { fromRowKey: "a", toRowKey: "a" })).toEqual(drafts);
  });
});

describe("テンプレートごとの入力の誤り", () => {
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

  it("空の名前と、受付時間の外に出た人数は、そのテンプレートの誤りとして返す", () => {
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

  it("受付時間の外に出た人数は、切りそろえると誤りでなくなる", () => {
    const outside = barsToStaffingSegments([bar(hall, "08:00", "12:00"), bar(hall, "07:00", "09:00")]);
    const trimmed = trimSegmentsToRange({
      segments: outside,
      range: { startMinutes: 540, endMinutes: 1320 },
      unitMinutes: 30,
    });
    const [target] = changeDayTemplateSegments([draft()], "a", trimmed);

    expect(issuesOf([target])).toEqual({});
    expect(toDayTemplateInputs([target], timeContext)[0].requirements).toEqual({
      kind: "time",
      bars: [{ positionId: hall, startTime: "09:00", endTime: "12:00" }],
    });
  });

  it("1つの時間の人数が1ポジションの上限（50人）を超えるテンプレートを、誤りとして返す", () => {
    const withCount = (count: number) =>
      draft({ requirements: { kind: "time", segments: [seg(hall, "11:00", "14:00", count)] } });

    expect(SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT).toBe(50);
    expect(issuesOf([withCount(50)])).toEqual({});
    expect(issuesOf([withCount(51)])).toEqual({ a: "BAR_CONCURRENT_LIMIT" });
  });

  it("人数をバーへ変えた本数が、1つのテンプレートの上限を超えるテンプレートを、誤りとして返す", () => {
    // 30分おきに10人と0人を繰り返すと、人数の入った時間1つにつき、バーが10本になる。
    const blocks = (positionId: string, blockCount: number) =>
      Array.from({ length: blockCount }, (_, index) => {
        const start = 9 * 60 + index * 60;
        const time = (minutes: number) =>
          `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        return seg(positionId, time(start), time(start + 30), 10);
      });
    const atLimit = draft({ requirements: { kind: "time", segments: [...blocks(hall, 13), ...blocks(kitchen, 7)] } });
    const overLimit = draft({
      requirements: {
        kind: "time",
        segments: [...blocks(hall, 13), ...blocks(kitchen, 7), seg(kitchen, "20:00", "20:30", 1)],
      },
    });

    const atLimitRequirements = toDayTemplateInputs([atLimit], timeContext)[0].requirements;
    expect(atLimitRequirements.kind === "time" ? atLimitRequirements.bars : []).toHaveLength(
      SHIFT_DAY_TEMPLATE_BAR_LIMIT,
    );
    expect(issuesOf([atLimit])).toEqual({});
    expect(issuesOf([overLimit])).toEqual({ a: "BAR_LIMIT" });
  });

  it("名前の重複は、あとから出てくるテンプレートの誤りとして返し、曜日と祝日の重なりは誤りにしない", () => {
    expect(
      issuesOf([
        draft({ rowKey: "a", name: "平日", weekdays: ["mon"], appliesToHolidays: true }),
        draft({ rowKey: "b", name: " 平日 ", weekdays: ["tue"] }),
        draft({ rowKey: "c", name: "月曜", weekdays: ["mon"] }),
        draft({ rowKey: "d", name: "祝日", weekdays: [], appliesToHolidays: true }),
      ]),
    ).toEqual({ b: "NAME_DUPLICATED" });
  });

  it("いまの集め方と種類が違う必要人数を、誤りとして返す", () => {
    expect(issuesOf([draft()], dateOnlyPattern)).toEqual({ a: "REQUIREMENTS_KIND_MISMATCH" });
  });

  it("テンプレートは20件まで誤りにならず、21件で一覧全体の誤りになる", () => {
    const build = (length: number) =>
      toDayTemplateInputs(
        Array.from({ length }, (_, index) =>
          draft({ rowKey: `row-${index}`, name: `テンプレート${index}`, weekdays: [] }),
        ),
        timeContext,
      );

    expect(findDayTemplateInputsIssue(build(SHIFT_DAY_TEMPLATE_LIMIT), timePattern)).toBeNull();
    expect(findDayTemplateInputsIssue(build(SHIFT_DAY_TEMPLATE_LIMIT + 1), timePattern)).toBe("TEMPLATE_LIMIT");
  });
});

describe("テンプレートを使う日の要約", () => {
  it.each([
    [["mon", "tue", "wed", "thu", "fri"], false, "月〜金"],
    [["sat", "sun"], false, "土・日"],
    [["sun", "mon", "thu", "fri", "sat"], false, "月・木〜日"],
    [["mon", "tue", "thu", "fri"], false, "月・火・木・金"],
    [["mon", "wed", "fri"], false, "月・水・金"],
    [["sun", "mon", "tue", "wed", "thu", "fri", "sat"], false, "毎日"],
    [["sat", "sun"], true, "土・日・祝日"],
    [[], true, "祝日"],
    [[], false, "個別"],
  ] as const)("曜日%jと祝日%sは「%s」と表す", (weekdays, appliesToHolidays, expected) => {
    expect(formatDayTemplateUsage({ weekdays: [...weekdays], appliesToHolidays })).toBe(expected);
  });
});

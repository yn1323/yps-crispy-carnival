import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import {
  buildDefaultDayTemplateSlotKeys,
  type DayTemplateIssue,
  type DayTemplateSlotKey,
  findDayTemplateIssue,
  projectDayTemplateSlotsForPattern,
  resolveDayTemplateForDate,
  type ShiftSetupWeekday,
} from "./dayTemplates";

const TIME_PATTERN: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "late", name: "遅番", startTime: "17:00", endTime: "22:00", sortOrder: 1 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
  ],
};
const DATE_ONLY_PATTERN: ShiftSubmissionPattern = { kind: "dateOnly" };

const timeKey = (startTime: string, endTime: string): DayTemplateSlotKey => ({ kind: "time", startTime, endTime });
const shiftTypeKey = (optionId: string): DayTemplateSlotKey => ({ kind: "shiftType", optionId });
const ALL_DAY_KEY: DayTemplateSlotKey = { kind: "allDay" };

describe("buildDefaultDayTemplateSlotKeys", () => {
  it("時間指定は受付時間を1つの時間帯にする", () => {
    expect(buildDefaultDayTemplateSlotKeys(TIME_PATTERN)).toEqual([
      { kind: "time", startTime: "09:00", endTime: "22:00" },
    ]);
  });

  it("パターン選択は勤務パターンを設定順に区切りにする", () => {
    expect(buildDefaultDayTemplateSlotKeys(SHIFT_TYPE_PATTERN)).toEqual([
      { kind: "shiftType", optionId: "late" },
      { kind: "shiftType", optionId: "early" },
    ]);
  });

  it("日付選択は終日の1区分にする", () => {
    expect(buildDefaultDayTemplateSlotKeys(DATE_ONLY_PATTERN)).toEqual([{ kind: "allDay" }]);
  });
});

describe("projectDayTemplateSlotsForPattern", () => {
  it("時間指定は受付時間内の時間帯だけを残し、開始順に並べる", () => {
    const slots = [
      { key: timeKey("17:00", "22:00"), label: "夜" },
      { key: ALL_DAY_KEY, label: "終日" },
      { key: timeKey("08:00", "10:00"), label: "受付時間より前" },
      { key: timeKey("09:00", "12:00"), label: "朝" },
      { key: shiftTypeKey("early"), label: "勤務パターン" },
      { key: timeKey("21:00", "23:00"), label: "受付時間より後" },
      { key: timeKey("12:00", "12:00"), label: "長さなし" },
      { key: timeKey("9時", "12時"), label: "不正な時刻" },
      { key: timeKey("09:00", "11:00"), label: "朝の前半" },
    ];

    expect(projectDayTemplateSlotsForPattern(slots, TIME_PATTERN).map((slot) => slot.label)).toEqual([
      "朝の前半",
      "朝",
      "夜",
    ]);
  });

  it("パターン選択はいまある勤務パターンだけを残し、設定順に並べる", () => {
    const slots = [
      { key: shiftTypeKey("early"), label: "早番" },
      { key: shiftTypeKey("removed"), label: "消えた勤務パターン" },
      { key: timeKey("09:00", "12:00"), label: "時間帯" },
      { key: shiftTypeKey("late"), label: "遅番" },
      { key: ALL_DAY_KEY, label: "終日" },
    ];

    expect(projectDayTemplateSlotsForPattern(slots, SHIFT_TYPE_PATTERN).map((slot) => slot.label)).toEqual([
      "遅番",
      "早番",
    ]);
  });

  it("日付選択は終日の区切りを1つだけ残す", () => {
    const slots = [
      { key: timeKey("09:00", "12:00"), label: "時間帯" },
      { key: ALL_DAY_KEY, label: "終日1" },
      { key: shiftTypeKey("early"), label: "勤務パターン" },
      { key: ALL_DAY_KEY, label: "終日2" },
    ];

    expect(projectDayTemplateSlotsForPattern(slots, DATE_ONLY_PATTERN).map((slot) => slot.label)).toEqual(["終日1"]);
  });

  it("入力の配列を並べ替えない", () => {
    const slots = [{ key: timeKey("17:00", "22:00") }, { key: timeKey("09:00", "12:00") }];

    projectDayTemplateSlotsForPattern(slots, TIME_PATTERN);

    expect(slots).toEqual([{ key: timeKey("17:00", "22:00") }, { key: timeKey("09:00", "12:00") }]);
  });
});

describe("findDayTemplateIssue", () => {
  const limits = { templates: 2, nameLength: 4, slots: 2, requiredCount: 9 };
  type TemplateInput = {
    name: string;
    weekdays: ShiftSetupWeekday[];
    slots: Array<{ key: DayTemplateSlotKey; requirements: Array<{ positionId: string; count: number }> }>;
  };
  const template = (overrides: Partial<TemplateInput> = {}): TemplateInput => ({
    name: "平日",
    weekdays: ["mon"],
    slots: [],
    ...overrides,
  });
  const slot = (key: DayTemplateSlotKey, requirements: Array<{ positionId: string; count: number }> = []) => ({
    key,
    requirements,
  });
  const find = (templates: TemplateInput[], pattern: ShiftSubmissionPattern = TIME_PATTERN) =>
    findDayTemplateIssue({ templates, pattern, limits });

  it("違反がなければnullを返す", () => {
    expect(
      find([
        template({
          name: " あいうえ ",
          weekdays: ["mon", "tue"],
          slots: [
            slot(timeKey("09:00", "12:00"), [
              { positionId: "hall", count: 0 },
              { positionId: "kitchen", count: 9 },
            ]),
            slot(timeKey("12:00", "22:00"), [{ positionId: "hall", count: 1 }]),
          ],
        }),
        template({ name: "週末", weekdays: ["sat", "sun"] }),
      ]),
    ).toBeNull();
    expect(find([])).toBeNull();
  });

  it("パターン選択と日付選択の区切りも、提出方法に合えば違反にしない", () => {
    expect(
      find([template({ slots: [slot(shiftTypeKey("early")), slot(shiftTypeKey("late"))] })], SHIFT_TYPE_PATTERN),
    ).toBeNull();
    expect(find([template({ slots: [slot(ALL_DAY_KEY)] })], DATE_ONLY_PATTERN)).toBeNull();
  });

  const cases: Array<{
    name: string;
    templates: TemplateInput[];
    pattern?: ShiftSubmissionPattern;
    issue: DayTemplateIssue;
  }> = [
    {
      name: "型の件数が上限を超える",
      templates: [
        template({ name: "A", weekdays: [] }),
        template({ name: "B", weekdays: [] }),
        template({ name: "C", weekdays: [] }),
      ],
      issue: "TEMPLATE_LIMIT",
    },
    { name: "名前が空白だけ", templates: [template({ name: "  " })], issue: "NAME_REQUIRED" },
    { name: "名前が上限より長い", templates: [template({ name: "あいうえお" })], issue: "NAME_TOO_LONG" },
    {
      name: "前後の空白を除いた名前が重複する",
      templates: [template({ name: "平日", weekdays: ["mon"] }), template({ name: " 平日 ", weekdays: ["tue"] })],
      issue: "NAME_DUPLICATED",
    },
    {
      name: "同じ曜日を2つの型に割り当てる",
      templates: [
        template({ name: "平日", weekdays: ["mon", "tue"] }),
        template({ name: "週末", weekdays: ["sat", "tue"] }),
      ],
      issue: "WEEKDAY_DUPLICATED",
    },
    {
      name: "1つの型に同じ曜日が2回ある",
      templates: [template({ weekdays: ["mon", "mon"] })],
      issue: "WEEKDAY_DUPLICATED",
    },
    {
      name: "区切りの件数が上限を超える",
      templates: [
        template({
          slots: [slot(timeKey("09:00", "10:00")), slot(timeKey("10:00", "11:00")), slot(timeKey("11:00", "12:00"))],
        }),
      ],
      issue: "SLOT_LIMIT",
    },
    {
      name: "時間指定に終日の区切りがある",
      templates: [template({ slots: [slot(ALL_DAY_KEY)] })],
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "時間指定に勤務パターンの区切りがある",
      templates: [template({ slots: [slot(shiftTypeKey("early"))] })],
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "時間帯が受付時間の外に出る",
      templates: [template({ slots: [slot(timeKey("08:30", "10:00"))] })],
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "時間帯の開始が終了以降",
      templates: [template({ slots: [slot(timeKey("12:00", "12:00"))] })],
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "時間帯の時刻の形式が不正",
      templates: [template({ slots: [slot(timeKey("9時", "12時"))] })],
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "パターン選択に時間帯の区切りがある",
      templates: [template({ slots: [slot(timeKey("09:00", "15:00"))] })],
      pattern: SHIFT_TYPE_PATTERN,
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "パターン選択に存在しない勤務パターンがある",
      templates: [template({ slots: [slot(shiftTypeKey("removed"))] })],
      pattern: SHIFT_TYPE_PATTERN,
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "日付選択に時間帯の区切りがある",
      templates: [template({ slots: [slot(timeKey("09:00", "22:00"))] })],
      pattern: DATE_ONLY_PATTERN,
      issue: "SLOT_NOT_FOR_PATTERN",
    },
    {
      name: "同じ時間帯が2回ある",
      templates: [template({ slots: [slot(timeKey("09:00", "12:00")), slot(timeKey("09:00", "12:00"))] })],
      issue: "SLOT_DUPLICATED",
    },
    {
      name: "同じ勤務パターンが2回ある",
      templates: [template({ slots: [slot(shiftTypeKey("early")), slot(shiftTypeKey("early"))] })],
      pattern: SHIFT_TYPE_PATTERN,
      issue: "SLOT_DUPLICATED",
    },
    {
      name: "終日の区切りが2回ある",
      templates: [template({ slots: [slot(ALL_DAY_KEY), slot(ALL_DAY_KEY)] })],
      pattern: DATE_ONLY_PATTERN,
      issue: "SLOT_DUPLICATED",
    },
    {
      name: "時間帯が重なる",
      templates: [template({ slots: [slot(timeKey("09:00", "12:00")), slot(timeKey("11:30", "14:00"))] })],
      issue: "SLOT_OVERLAP",
    },
    {
      name: "1つの区切りに同じポジションの必要人数が2回ある",
      templates: [
        template({
          slots: [
            slot(timeKey("09:00", "12:00"), [
              { positionId: "hall", count: 1 },
              { positionId: "hall", count: 2 },
            ]),
          ],
        }),
      ],
      issue: "REQUIREMENT_DUPLICATED",
    },
    {
      name: "必要人数が負の数",
      templates: [template({ slots: [slot(timeKey("09:00", "12:00"), [{ positionId: "hall", count: -1 }])] })],
      issue: "REQUIREMENT_COUNT_INVALID",
    },
    {
      name: "必要人数が整数でない",
      templates: [template({ slots: [slot(timeKey("09:00", "12:00"), [{ positionId: "hall", count: 1.5 }])] })],
      issue: "REQUIREMENT_COUNT_INVALID",
    },
    {
      name: "必要人数が上限を超える",
      templates: [template({ slots: [slot(timeKey("09:00", "12:00"), [{ positionId: "hall", count: 10 }])] })],
      issue: "REQUIREMENT_COUNT_INVALID",
    },
  ];

  it.each(cases)("$name 場合は $issue を返す", ({ templates, pattern, issue }) => {
    expect(find(templates, pattern)).toBe(issue);
  });

  it("複数の違反がある場合は、最初に見つけた違反だけを返す", () => {
    expect(
      find([
        template({ name: "", slots: [slot(ALL_DAY_KEY)] }),
        template({ name: "B", weekdays: [] }),
        template({ name: "C", weekdays: [] }),
      ]),
    ).toBe("TEMPLATE_LIMIT");
    expect(find([template({ name: "平日", weekdays: ["mon"] }), template({ name: "平日", weekdays: ["mon"] })])).toBe(
      "NAME_DUPLICATED",
    );
  });
});

describe("resolveDayTemplateForDate", () => {
  // 2026-01-20は火曜日、2026-01-21は水曜日。
  const templates: Array<{ id: string; weekdays: ShiftSetupWeekday[] }> = [
    { id: "weekday", weekdays: ["mon", "tue"] },
    { id: "weekend", weekdays: ["sat", "sun"] },
    { id: "event", weekdays: [] },
  ];

  it("特別な日の指定がなければ、曜日に割り当てた型を返す", () => {
    expect(resolveDayTemplateForDate("2026-01-20", templates, [])).toEqual({ id: "weekday", weekdays: ["mon", "tue"] });
  });

  it("特別な日の指定を曜日の割り当てより優先する", () => {
    expect(
      resolveDayTemplateForDate("2026-01-20", templates, [
        { date: "2026-01-19", templateId: "weekend" },
        { date: "2026-01-20", templateId: "event" },
      ]),
    ).toEqual({ id: "event", weekdays: [] });
  });

  it("ほかの日付の特別な日は、その日に当てない", () => {
    expect(resolveDayTemplateForDate("2026-01-20", templates, [{ date: "2026-01-21", templateId: "event" }])).toEqual({
      id: "weekday",
      weekdays: ["mon", "tue"],
    });
  });

  it("削除された型を指す特別な日は、曜日の割り当てへ戻る", () => {
    expect(resolveDayTemplateForDate("2026-01-20", templates, [{ date: "2026-01-20", templateId: "deleted" }])).toEqual(
      { id: "weekday", weekdays: ["mon", "tue"] },
    );
  });

  it("どの型にも当たらない日はnullを返す", () => {
    expect(resolveDayTemplateForDate("2026-01-21", templates, [])).toBeNull();
    expect(
      resolveDayTemplateForDate("2026-01-21", templates, [{ date: "2026-01-21", templateId: "deleted" }]),
    ).toBeNull();
  });

  it("曜日の割り当てがない日でも、特別な日の指定があればその型を返す", () => {
    expect(resolveDayTemplateForDate("2026-01-21", templates, [{ date: "2026-01-21", templateId: "event" }])).toEqual({
      id: "event",
      weekdays: [],
    });
  });
});

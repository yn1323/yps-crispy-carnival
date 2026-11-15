import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  addTimeSlot,
  canAddTimeSlot,
  changeRequiredCount,
  changeTimeSlotRange,
  createDayTemplateDraft,
  findDayTemplateDraftIssues,
  getDayTemplateSlotLabel,
  getTimeSlotEndOptions,
  getTimeSlotStartOptions,
  getUnassignedWeekdays,
  isSameDayTemplateInputs,
  removeDayTemplateSlot,
  toDayTemplateDrafts,
  toDayTemplateDraftsFromSuggestion,
  toDayTemplateInputs,
  toggleDayTemplateWeekday,
} from "./dayTemplateDrafts";
import type { DayTemplateDraft, DayTemplateSlotDraft, ShiftSetupSubmissionPattern } from "./types";

const hall = "position-hall" as Id<"positions">;
const kitchen = "position-kitchen" as Id<"positions">;
const positions = [{ _id: hall }, { _id: kitchen }];

const timePattern: ShiftSetupSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
const shiftTypePattern: ShiftSetupSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};
const dateOnlyPattern: ShiftSetupSubmissionPattern = { kind: "dateOnly" };

function timeSlot(startTime: string, endTime: string, counts: Record<string, number> = {}): DayTemplateSlotDraft {
  return { rowKey: `${startTime}-${endTime}`, key: { kind: "time", startTime, endTime }, counts };
}

function draft(overrides: Partial<DayTemplateDraft> = {}): DayTemplateDraft {
  return { rowKey: "a", name: "平日", weekdays: ["mon"], slots: [timeSlot("09:00", "22:00")], ...overrides };
}

const timeRanges = (target: DayTemplateDraft) =>
  target.slots.map((slot) => (slot.key.kind === "time" ? `${slot.key.startTime}-${slot.key.endTime}` : slot.key.kind));

describe("保存済みの型を編集中の形へ直す", () => {
  const templateId = "template-a" as Id<"shiftDayTemplates">;

  it("時間指定は、受付時間に収まる時間帯だけを開始の早い順に並べる", () => {
    const [result] = toDayTemplateDrafts(
      [
        {
          _id: templateId,
          name: "平日",
          weekdays: ["mon", "tue"],
          slots: [
            { key: { kind: "time", startTime: "14:00", endTime: "22:00" }, requirements: [] },
            // 受付時間より前に始まる時間帯は、いまの提出方法では使えない。
            { key: { kind: "time", startTime: "08:00", endTime: "09:00" }, requirements: [] },
            {
              key: { kind: "time", startTime: "09:00", endTime: "14:00" },
              requirements: [
                { positionId: hall, count: 2 },
                { positionId: kitchen, count: 0 },
              ],
            },
            { key: { kind: "shiftType", optionId: "early" }, requirements: [] },
          ],
        },
      ],
      timePattern,
    );

    expect(result).toEqual({
      rowKey: templateId,
      id: templateId,
      name: "平日",
      weekdays: ["mon", "tue"],
      slots: [
        {
          rowKey: "time:09:00-14:00",
          key: { kind: "time", startTime: "09:00", endTime: "14:00" },
          counts: { [hall]: 2 },
        },
        { rowKey: "time:14:00-22:00", key: { kind: "time", startTime: "14:00", endTime: "22:00" }, counts: {} },
      ],
    });
  });

  it("パターン選択は、保存していない勤務パターンも人数なしの行として出す", () => {
    const [result] = toDayTemplateDrafts(
      [
        {
          _id: templateId,
          name: "平日",
          weekdays: [],
          slots: [
            { key: { kind: "shiftType", optionId: "late" }, requirements: [{ positionId: hall, count: 3 }] },
            { key: { kind: "shiftType", optionId: "removed" }, requirements: [{ positionId: hall, count: 1 }] },
          ],
        },
      ],
      shiftTypePattern,
    );

    expect(result.slots).toEqual([
      { rowKey: "shiftType:early", key: { kind: "shiftType", optionId: "early" }, counts: {} },
      { rowKey: "shiftType:late", key: { kind: "shiftType", optionId: "late" }, counts: { [hall]: 3 } },
    ]);
  });

  it("日付選択は、1日の1行だけを出す", () => {
    const [result] = toDayTemplateDrafts(
      [
        {
          _id: templateId,
          name: "平日",
          weekdays: [],
          slots: [
            { key: { kind: "time", startTime: "09:00", endTime: "22:00" }, requirements: [] },
            { key: { kind: "allDay" }, requirements: [{ positionId: kitchen, count: 4 }] },
          ],
        },
      ],
      dateOnlyPattern,
    );

    expect(result.slots).toEqual([{ rowKey: "allDay", key: { kind: "allDay" }, counts: { [kitchen]: 4 } }]);
  });

  it("AIの下書きは、idを持たない新しい型になる", () => {
    let count = 0;
    const result = toDayTemplateDraftsFromSuggestion(
      [
        {
          name: "平日",
          weekdays: ["mon"],
          slots: [{ key: { kind: "allDay" }, requirements: [{ positionId: hall, count: 2 }] }],
        },
        { name: "週末", weekdays: ["sat"], slots: [] },
      ],
      dateOnlyPattern,
      () => {
        count += 1;
        return `new-${count}`;
      },
    );

    expect(result).toEqual([
      {
        rowKey: "new-1",
        name: "平日",
        weekdays: ["mon"],
        slots: [{ rowKey: "allDay", key: { kind: "allDay" }, counts: { [hall]: 2 } }],
      },
      {
        rowKey: "new-2",
        name: "週末",
        weekdays: ["sat"],
        slots: [{ rowKey: "allDay", key: { kind: "allDay" }, counts: {} }],
      },
    ]);
  });
});

describe("新しく足す型の初期値", () => {
  it("最初の型は、定休日を除くすべての曜日と、提出方法に合う区切りを持つ", () => {
    const base = { drafts: [], regularClosedDays: ["wed" as const], rowKey: "new-1" };

    const time = createDayTemplateDraft({ ...base, pattern: timePattern });
    expect(time).toEqual({
      rowKey: "new-1",
      name: "通常",
      weekdays: ["sun", "mon", "tue", "thu", "fri", "sat"],
      slots: [{ rowKey: "time:09:00-22:00", key: { kind: "time", startTime: "09:00", endTime: "22:00" }, counts: {} }],
    });

    const shiftType = createDayTemplateDraft({ ...base, pattern: shiftTypePattern });
    expect(shiftType.slots.map((slot) => slot.key)).toEqual([
      { kind: "shiftType", optionId: "early" },
      { kind: "shiftType", optionId: "late" },
    ]);

    const dateOnly = createDayTemplateDraft({ ...base, pattern: dateOnlyPattern });
    expect(dateOnly.slots.map((slot) => slot.key)).toEqual([{ kind: "allDay" }]);
  });

  it("2つ目以降は、まだ割り当てていない営業日と、直前の型の区切りと人数を初期値にする", () => {
    const first = draft({
      name: "型2",
      weekdays: ["mon", "tue", "thu", "fri"],
      slots: [timeSlot("09:00", "14:00", { [hall]: 2 }), timeSlot("14:00", "22:00")],
    });

    const added = createDayTemplateDraft({
      drafts: [first],
      pattern: timePattern,
      regularClosedDays: ["wed"],
      rowKey: "new-2",
    });

    expect(added.weekdays).toEqual(["sun", "sat"]);
    // 「型2」はすでにあるため、重ならない名前にする。
    expect(added.name).toBe("型3");
    expect(added.slots).toEqual(first.slots);
    // 写した人数を変えても、元の型は変わらない。
    added.slots[0].counts[hall] = 9;
    expect(first.slots[0].counts[hall]).toBe(2);
  });

  it("どの型にも割り当てていない曜日を返す", () => {
    expect(
      getUnassignedWeekdays([draft({ weekdays: ["mon", "tue"] }), draft({ rowKey: "b", weekdays: ["sat", "sun"] })]),
    ).toEqual(["wed", "thu", "fri"]);
  });
});

describe("曜日の割り当て", () => {
  const drafts = [
    draft({ rowKey: "weekday", weekdays: ["mon", "fri"] }),
    draft({ rowKey: "weekend", name: "土日", weekdays: ["sat"] }),
  ];

  it("割り当てていない曜日を押すと、その型に入る", () => {
    const result = toggleDayTemplateWeekday(drafts, "weekend", "sun");
    expect(result.map((item) => item.weekdays)).toEqual([
      ["mon", "fri"],
      ["sat", "sun"],
    ]);
  });

  it("別の型が持つ曜日を押すと、その型から外して移す", () => {
    const result = toggleDayTemplateWeekday(drafts, "weekend", "fri");
    expect(result.map((item) => item.weekdays)).toEqual([["mon"], ["sat", "fri"]]);
  });

  it("選んでいる曜日を押すと外れ、どの型にも入らない曜日になる", () => {
    const result = toggleDayTemplateWeekday(drafts, "weekday", "mon");
    expect(result.map((item) => item.weekdays)).toEqual([["fri"], ["sat"]]);
  });
});

describe("必要人数の増減", () => {
  const target = { templateRowKey: "a", slotRowKey: "09:00-22:00", positionId: hall };
  const countOf = (drafts: DayTemplateDraft[]) => drafts[0].slots[0].counts;

  it("未設定から1人増やし、0へ戻すと未設定に戻る", () => {
    const increased = changeRequiredCount([draft()], target, 1);
    expect(countOf(increased)).toEqual({ [hall]: 1 });
    expect(countOf(changeRequiredCount(increased, target, -1))).toEqual({});
  });

  it("0より下と上限の99より上には動かない", () => {
    expect(countOf(changeRequiredCount([draft()], target, -1))).toEqual({});

    const atMax = [draft({ slots: [timeSlot("09:00", "22:00", { [hall]: 99 })] })];
    expect(countOf(changeRequiredCount(atMax, target, 1))).toEqual({ [hall]: 99 });
    expect(countOf(changeRequiredCount(atMax, target, -1))).toEqual({ [hall]: 98 });
  });
});

describe("時間帯の追加と変更", () => {
  it("受付時間をすべて覆っている場合は、最後の時間帯を区切りのよい時刻で分け、人数を写す", () => {
    const [result] = addTimeSlot(
      [draft({ slots: [timeSlot("09:00", "22:00", { [hall]: 2 })] })],
      "a",
      timePattern,
      "new-1",
    );

    expect(result.slots).toEqual([
      { rowKey: "09:00-22:00", key: { kind: "time", startTime: "09:00", endTime: "16:00" }, counts: { [hall]: 2 } },
      { rowKey: "new-1", key: { kind: "time", startTime: "16:00", endTime: "22:00" }, counts: { [hall]: 2 } },
    ]);
  });

  it("受付時間の中に空きがある場合は、最初の空きを人数なしの時間帯で埋める", () => {
    const source = draft({ slots: [timeSlot("09:00", "12:00"), timeSlot("15:00", "22:00", { [hall]: 1 })] });

    const [filled] = addTimeSlot([source], "a", timePattern, "new-1");
    expect(timeRanges(filled)).toEqual(["09:00-12:00", "12:00-15:00", "15:00-22:00"]);
    expect(filled.slots[1]).toEqual({
      rowKey: "new-1",
      key: { kind: "time", startTime: "12:00", endTime: "15:00" },
      counts: {},
    });

    // 終わりを早めた場合は、残りの時間を埋める。
    const [tail] = addTimeSlot([draft({ slots: [timeSlot("09:00", "17:00")] })], "a", timePattern, "new-2");
    expect(timeRanges(tail)).toEqual(["09:00-17:00", "17:00-22:00"]);
  });

  it("最後の時間帯が30分なら、分けられるいちばん長い時間帯を分ける", () => {
    const source = draft({ slots: [timeSlot("09:00", "21:30"), timeSlot("21:30", "22:00")] });
    const [result] = addTimeSlot([source], "a", timePattern, "new-1");
    expect(timeRanges(result)).toEqual(["09:00-15:00", "15:00-21:30", "21:30-22:00"]);
  });

  it("上限の8件に達した型と、分けられる時間帯がない型には足せない", () => {
    const eight = draft({
      slots: ["09", "10", "11", "12", "13", "14", "15", "16"].map((hour) =>
        timeSlot(`${hour}:00`, `${Number(hour) + 1}:00`),
      ),
    });
    expect(canAddTimeSlot(eight, timePattern)).toBe(false);
    expect(addTimeSlot([eight], "a", timePattern, "new-1")).toEqual([eight]);

    const shortPattern: ShiftSetupSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "09:30" };
    expect(canAddTimeSlot(draft({ slots: [timeSlot("09:00", "09:30")] }), shortPattern)).toBe(false);
    expect(canAddTimeSlot(draft({ slots: [timeSlot("09:00", "10:00")] }), timePattern)).toBe(true);
    // 時間帯を持たない提出方法では足せない。
    expect(canAddTimeSlot(draft({ slots: [] }), dateOnlyPattern)).toBe(false);
  });

  it("時刻を変えても行の識別子と人数は変わらず、削除すると行がなくなる", () => {
    const source = [draft({ slots: [timeSlot("09:00", "14:00", { [hall]: 2 }), timeSlot("14:00", "22:00")] })];
    const target = { templateRowKey: "a", slotRowKey: "09:00-14:00" };

    const [changed] = changeTimeSlotRange(source, target, { endTime: "13:00" });
    expect(changed.slots[0]).toEqual({
      rowKey: "09:00-14:00",
      key: { kind: "time", startTime: "09:00", endTime: "13:00" },
      counts: { [hall]: 2 },
    });

    const [removed] = removeDayTemplateSlot(source, target);
    expect(timeRanges(removed)).toEqual(["14:00-22:00"]);
  });

  it("開始は終了より前、終了は開始より後の、受付時間内の時刻だけを選べる", () => {
    const starts = getTimeSlotStartOptions(timePattern, "10:30").map((option) => option.value);
    expect(starts).toEqual(["09:00", "09:30", "10:00"]);

    const ends = getTimeSlotEndOptions(timePattern, "20:30").map((option) => option.value);
    expect(ends).toEqual(["21:00", "21:30", "22:00"]);

    expect(getTimeSlotStartOptions(dateOnlyPattern, "10:00")).toEqual([]);
    expect(getTimeSlotEndOptions(shiftTypePattern, "10:00")).toEqual([]);
  });
});

describe("保存する形への変換", () => {
  it("人数0といまは無いポジションを除き、曜日と時間帯を決まった順に並べる", () => {
    const templateId = "template-a" as Id<"shiftDayTemplates">;
    const inputs = toDayTemplateInputs(
      [
        draft({
          id: templateId,
          weekdays: ["sat", "mon", "sun"],
          slots: [
            timeSlot("14:00", "22:00", { [kitchen]: 1, [hall]: 3, "position-removed": 5 }),
            timeSlot("09:00", "14:00", { [hall]: 0 }),
          ],
        }),
        draft({ rowKey: "b", name: "土日", weekdays: [], slots: [] }),
      ],
      positions,
    );

    expect(inputs).toEqual([
      {
        id: templateId,
        name: "平日",
        weekdays: ["sun", "mon", "sat"],
        slots: [
          { key: { kind: "time", startTime: "09:00", endTime: "14:00" }, requirements: [] },
          {
            key: { kind: "time", startTime: "14:00", endTime: "22:00" },
            requirements: [
              { positionId: hall, count: 3 },
              { positionId: kitchen, count: 1 },
            ],
          },
        ],
      },
      // まだ保存していない型はidを持たない。
      { name: "土日", weekdays: [], slots: [] },
    ]);
  });

  it("行の識別子だけが違う編集中の値は、保存内容としては同じとみなす", () => {
    const left = toDayTemplateInputs([draft({ slots: [timeSlot("09:00", "22:00", { [hall]: 1 })] })], positions);
    const right = toDayTemplateInputs(
      [
        draft({
          rowKey: "other",
          slots: [{ ...timeSlot("09:00", "22:00", { [hall]: 1 }), rowKey: "other-slot" }],
        }),
      ],
      positions,
    );
    const changed = toDayTemplateInputs([draft({ slots: [timeSlot("09:00", "22:00", { [hall]: 2 })] })], positions);

    expect(isSameDayTemplateInputs(left, right)).toBe(true);
    expect(isSameDayTemplateInputs(left, changed)).toBe(false);
  });
});

describe("型ごとの入力の誤り", () => {
  it("誤りのない一覧では空を返す", () => {
    expect(findDayTemplateDraftIssues([draft()], timePattern, positions)).toEqual({});
  });

  it("重なった時間帯と空の名前は、その型の誤りとして返す", () => {
    const issues = findDayTemplateDraftIssues(
      [
        draft({ rowKey: "overlap", slots: [timeSlot("09:00", "15:00"), timeSlot("14:00", "22:00")] }),
        draft({ rowKey: "unnamed", name: "  ", weekdays: [] }),
        draft({ rowKey: "valid", name: "土日", weekdays: ["sat"] }),
      ],
      timePattern,
      positions,
    );

    expect(issues).toEqual({ overlap: "SLOT_OVERLAP", unnamed: "NAME_REQUIRED" });
  });

  it("名前の重複は、あとから出てくる型の誤りとして返す", () => {
    const issues = findDayTemplateDraftIssues(
      [draft({ rowKey: "first", name: "平日" }), draft({ rowKey: "second", name: " 平日 ", weekdays: [] })],
      timePattern,
      positions,
    );

    expect(issues).toEqual({ second: "NAME_DUPLICATED" });
  });
});

describe("区切りの見出し", () => {
  it("時間帯は時刻、勤務パターンは名前と時刻、日付選択は「1日」を出す", () => {
    expect(getDayTemplateSlotLabel({ kind: "time", startTime: "09:00", endTime: "14:00" }, timePattern)).toEqual({
      title: "09:00〜14:00",
    });
    expect(getDayTemplateSlotLabel({ kind: "shiftType", optionId: "late" }, shiftTypePattern)).toEqual({
      title: "遅番",
      detail: "15:00〜22:00",
    });
    expect(getDayTemplateSlotLabel({ kind: "allDay" }, dateOnlyPattern)).toEqual({ title: "1日" });
  });
});

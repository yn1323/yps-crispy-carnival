import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { buildRandomShiftSetupDraft } from "./assistDraft";
import { findDayTemplateIssue } from "./dayTemplates";

/** 渡した値を順に返し、最後まで使ったら先頭へ戻る乱数。 */
function sequenceRandom(values: number[]) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};

const bar = (positionId: string, startTime: string, endTime: string) => ({ positionId, startTime, endTime });

describe("buildRandomShiftSetupDraft", () => {
  it("時間指定は、ポジションごとに受付時間いっぱいのバーを1本置き、受付時間に収まる昼の時間帯へバーを足す", () => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "time", startTime: "10:00", endTime: "15:00" },
      positionIds: ["hall", "kitchen"],
      regularClosedDays: [],
      random: sequenceRandom([0, 0.5, 0.99]),
    });

    expect(draft).toEqual([
      {
        name: "平日",
        weekdays: ["mon", "tue", "wed", "thu"],
        appliesToHolidays: false,
        requirements: {
          kind: "time",
          bars: [bar("hall", "10:00", "15:00"), bar("kitchen", "10:00", "15:00"), bar("kitchen", "11:00", "14:00")],
        },
      },
      {
        name: "週末",
        weekdays: ["sun", "fri", "sat"],
        appliesToHolidays: false,
        requirements: {
          kind: "time",
          bars: [
            bar("hall", "10:00", "15:00"),
            bar("kitchen", "10:00", "15:00"),
            bar("hall", "11:00", "14:00"),
            bar("hall", "11:00", "14:00"),
            bar("hall", "11:00", "14:00"),
            bar("kitchen", "11:00", "14:00"),
          ],
        },
      },
    ]);
  });

  it.each([
    {
      name: "昼と夜の時間帯をどちらも含む受付時間",
      startTime: "09:00",
      endTime: "22:00",
      expected: [bar("hall", "09:00", "22:00"), bar("hall", "11:00", "14:00"), bar("hall", "17:00", "21:00")],
    },
    {
      name: "夜の時間帯の一部だけを含む受付時間",
      startTime: "18:00",
      endTime: "20:00",
      expected: [bar("hall", "18:00", "20:00"), bar("hall", "18:00", "20:00")],
    },
    {
      name: "昼と夜のどちらの時間帯にもかからない受付時間",
      startTime: "14:00",
      endTime: "17:00",
      expected: [bar("hall", "14:00", "17:00")],
    },
    {
      name: "30分刻みにそろっていない受付時間",
      startTime: "09:15",
      endTime: "20:45",
      expected: [bar("hall", "09:30", "20:30"), bar("hall", "11:00", "14:00"), bar("hall", "17:00", "20:30")],
    },
    { name: "30分のバーを置けない受付時間", startTime: "09:10", endTime: "09:50", expected: [] },
  ])("時間指定のバー: $name", ({ startTime, endTime, expected }) => {
    const pattern: ShiftSubmissionPattern = { kind: "time", startTime, endTime };
    const draft = buildRandomShiftSetupDraft({
      pattern,
      positionIds: ["hall"],
      regularClosedDays: [],
      random: () => 0,
    });

    expect(draft.map((template) => template.requirements)).toEqual([
      // 平日の型は、受付時間いっぱいの1本だけになる。
      { kind: "time", bars: expected.slice(0, 1) },
      // 週末の型は、昼と夜の時間帯へ1本ずつ足す。
      { kind: "time", bars: expected },
    ]);
    expect(findDayTemplateIssue({ templates: draft, pattern })).toBeNull();
  });

  it("時間指定で最も多くバーを足しても、保存できる型になる", () => {
    const pattern: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "22:00" };
    const draft = buildRandomShiftSetupDraft({
      pattern,
      positionIds: Array.from({ length: 10 }, (_, index) => `position-${index}`),
      regularClosedDays: [],
      random: () => 0.99,
    });

    // 週末は、通しの1本に、昼と夜へ3本ずつ足す。
    expect(draft.map((template) => template.requirements.kind === "time" && template.requirements.bars.length)).toEqual(
      [50, 70],
    );
    expect(findDayTemplateIssue({ templates: draft, pattern })).toBeNull();
  });

  it("パターン選択は、勤務パターンごとにポジション別の人数を入れる", () => {
    const draft = buildRandomShiftSetupDraft({
      pattern: SHIFT_TYPE_PATTERN,
      positionIds: ["hall"],
      regularClosedDays: [],
      random: () => 0,
    });

    expect(draft).toEqual([
      {
        name: "平日",
        weekdays: ["mon", "tue", "wed", "thu"],
        appliesToHolidays: false,
        requirements: {
          kind: "shiftType",
          options: [
            { optionId: "early", counts: [{ positionId: "hall", count: 1 }] },
            { optionId: "late", counts: [{ positionId: "hall", count: 1 }] },
          ],
        },
      },
      {
        name: "週末",
        weekdays: ["sun", "fri", "sat"],
        appliesToHolidays: false,
        requirements: {
          kind: "shiftType",
          options: [
            { optionId: "early", counts: [{ positionId: "hall", count: 2 }] },
            { optionId: "late", counts: [{ positionId: "hall", count: 2 }] },
          ],
        },
      },
    ]);
    expect(findDayTemplateIssue({ templates: draft, pattern: SHIFT_TYPE_PATTERN })).toBeNull();
  });

  it("日付選択は、1日分のポジション別の人数を入れる", () => {
    const pattern: ShiftSubmissionPattern = { kind: "dateOnly" };
    const draft = buildRandomShiftSetupDraft({
      pattern,
      positionIds: ["hall", "kitchen"],
      regularClosedDays: [],
      random: () => 0.5,
    });

    expect(draft).toEqual([
      {
        name: "平日",
        weekdays: ["mon", "tue", "wed", "thu"],
        appliesToHolidays: false,
        requirements: {
          kind: "dateOnly",
          counts: [
            { positionId: "hall", count: 2 },
            { positionId: "kitchen", count: 2 },
          ],
        },
      },
      {
        name: "週末",
        weekdays: ["sun", "fri", "sat"],
        appliesToHolidays: false,
        requirements: {
          kind: "dateOnly",
          counts: [
            { positionId: "hall", count: 3 },
            { positionId: "kitchen", count: 3 },
          ],
        },
      },
    ]);
    expect(findDayTemplateIssue({ templates: draft, pattern })).toBeNull();
  });

  it("定休日の曜日を型に割り当てない", () => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "dateOnly" },
      positionIds: ["hall"],
      regularClosedDays: ["mon", "sun"],
      random: () => 0,
    });

    expect(draft.map(({ name, weekdays }) => ({ name, weekdays }))).toEqual([
      { name: "平日", weekdays: ["tue", "wed", "thu"] },
      { name: "週末", weekdays: ["fri", "sat"] },
    ]);
  });

  it("曜日がすべて定休日のまとまりは型を作らない", () => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "dateOnly" },
      positionIds: ["hall"],
      regularClosedDays: ["fri", "sat", "sun"],
      random: () => 0,
    });

    expect(draft.map(({ name, weekdays }) => ({ name, weekdays }))).toEqual([
      { name: "平日", weekdays: ["mon", "tue", "wed", "thu"] },
    ]);
  });

  it.each([
    { name: "1以上を返す乱数", value: 1, weekday: 3, weekend: 4 },
    { name: "負の値を返す乱数", value: -0.5, weekday: 1, weekend: 2 },
  ])("$name でも人数を決まった範囲に収める", ({ value, weekday, weekend }) => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "dateOnly" },
      positionIds: ["hall"],
      regularClosedDays: [],
      random: () => value,
    });

    expect(draft.map((template) => template.requirements)).toEqual([
      { kind: "dateOnly", counts: [{ positionId: "hall", count: weekday }] },
      { kind: "dateOnly", counts: [{ positionId: "hall", count: weekend }] },
    ]);
  });

  it.each([
    { name: "1以上を返す乱数", value: 1, weekday: 2, weekend: 3 },
    { name: "負の値を返す乱数", value: -0.5, weekday: 0, weekend: 1 },
  ])("$name でも、昼の時間帯へ足すバーを決まった本数に収める", ({ value, weekday, weekend }) => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "time", startTime: "10:00", endTime: "15:00" },
      positionIds: ["hall"],
      regularClosedDays: [],
      random: () => value,
    });

    expect(draft.map((template) => template.requirements)).toEqual([
      {
        kind: "time",
        bars: [bar("hall", "10:00", "15:00"), ...Array.from({ length: weekday }, () => bar("hall", "11:00", "14:00"))],
      },
      {
        kind: "time",
        bars: [bar("hall", "10:00", "15:00"), ...Array.from({ length: weekend }, () => bar("hall", "11:00", "14:00"))],
      },
    ]);
  });

  it("ポジションがなければ、必要人数を入れずに型だけを返す", () => {
    const build = (pattern: ShiftSubmissionPattern) =>
      buildRandomShiftSetupDraft({ pattern, positionIds: [], regularClosedDays: [], random: () => 0 }).map(
        (template) => template.requirements,
      );

    expect(build({ kind: "time", startTime: "09:00", endTime: "22:00" })).toEqual([
      { kind: "time", bars: [] },
      { kind: "time", bars: [] },
    ]);
    expect(build({ kind: "dateOnly" })).toEqual([
      { kind: "dateOnly", counts: [] },
      { kind: "dateOnly", counts: [] },
    ]);
  });
});

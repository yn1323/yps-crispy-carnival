import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { buildRandomShiftSetupDraft } from "./assistDraft";

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

describe("buildRandomShiftSetupDraft", () => {
  it("時間指定は受付時間を境目の時刻で区切り、平日と週末の型にポジション別の人数を入れる", () => {
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
        slots: [
          {
            key: { kind: "time", startTime: "10:00", endTime: "11:00" },
            requirements: [
              { positionId: "hall", count: 1 },
              { positionId: "kitchen", count: 2 },
            ],
          },
          {
            key: { kind: "time", startTime: "11:00", endTime: "14:00" },
            requirements: [
              { positionId: "hall", count: 3 },
              { positionId: "kitchen", count: 1 },
            ],
          },
          {
            key: { kind: "time", startTime: "14:00", endTime: "15:00" },
            requirements: [
              { positionId: "hall", count: 2 },
              { positionId: "kitchen", count: 3 },
            ],
          },
        ],
      },
      {
        name: "週末",
        weekdays: ["sun", "fri", "sat"],
        slots: [
          {
            key: { kind: "time", startTime: "10:00", endTime: "11:00" },
            requirements: [
              { positionId: "hall", count: 2 },
              { positionId: "kitchen", count: 3 },
            ],
          },
          {
            key: { kind: "time", startTime: "11:00", endTime: "14:00" },
            requirements: [
              { positionId: "hall", count: 4 },
              { positionId: "kitchen", count: 2 },
            ],
          },
          {
            key: { kind: "time", startTime: "14:00", endTime: "15:00" },
            requirements: [
              { positionId: "hall", count: 3 },
              { positionId: "kitchen", count: 4 },
            ],
          },
        ],
      },
    ]);
  });

  it.each([
    {
      name: "境目の時刻をすべて含む受付時間",
      startTime: "09:00",
      endTime: "22:00",
      expected: [
        ["09:00", "11:00"],
        ["11:00", "14:00"],
        ["14:00", "17:00"],
        ["17:00", "21:00"],
        ["21:00", "22:00"],
      ],
    },
    {
      name: "受付時間の端が境目の時刻と同じ",
      startTime: "11:00",
      endTime: "17:00",
      expected: [
        ["11:00", "14:00"],
        ["14:00", "17:00"],
      ],
    },
    { name: "境目の時刻を含まない受付時間", startTime: "12:00", endTime: "13:30", expected: [["12:00", "13:30"]] },
  ])("時間指定の区切り: $name", ({ startTime, endTime, expected }) => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "time", startTime, endTime },
      positionIds: ["hall"],
      regularClosedDays: [],
      random: () => 0,
    });

    expect(draft.map((template) => template.slots.map((slot) => slot.key))).toEqual([
      expected.map(([start, end]) => ({ kind: "time", startTime: start, endTime: end })),
      expected.map(([start, end]) => ({ kind: "time", startTime: start, endTime: end })),
    ]);
  });

  it("パターン選択は勤務パターンごとの区切りにする", () => {
    expect(
      buildRandomShiftSetupDraft({
        pattern: SHIFT_TYPE_PATTERN,
        positionIds: ["hall"],
        regularClosedDays: [],
        random: () => 0,
      }),
    ).toEqual([
      {
        name: "平日",
        weekdays: ["mon", "tue", "wed", "thu"],
        slots: [
          { key: { kind: "shiftType", optionId: "early" }, requirements: [{ positionId: "hall", count: 1 }] },
          { key: { kind: "shiftType", optionId: "late" }, requirements: [{ positionId: "hall", count: 1 }] },
        ],
      },
      {
        name: "週末",
        weekdays: ["sun", "fri", "sat"],
        slots: [
          { key: { kind: "shiftType", optionId: "early" }, requirements: [{ positionId: "hall", count: 2 }] },
          { key: { kind: "shiftType", optionId: "late" }, requirements: [{ positionId: "hall", count: 2 }] },
        ],
      },
    ]);
  });

  it("日付選択は終日の1区分にする", () => {
    expect(
      buildRandomShiftSetupDraft({
        pattern: { kind: "dateOnly" },
        positionIds: ["hall", "kitchen"],
        regularClosedDays: [],
        random: () => 0.5,
      }),
    ).toEqual([
      {
        name: "平日",
        weekdays: ["mon", "tue", "wed", "thu"],
        slots: [
          {
            key: { kind: "allDay" },
            requirements: [
              { positionId: "hall", count: 2 },
              { positionId: "kitchen", count: 2 },
            ],
          },
        ],
      },
      {
        name: "週末",
        weekdays: ["sun", "fri", "sat"],
        slots: [
          {
            key: { kind: "allDay" },
            requirements: [
              { positionId: "hall", count: 3 },
              { positionId: "kitchen", count: 3 },
            ],
          },
        ],
      },
    ]);
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

    expect(draft.map((template) => template.slots.map((slot) => slot.requirements))).toEqual([
      [[{ positionId: "hall", count: weekday }]],
      [[{ positionId: "hall", count: weekend }]],
    ]);
  });

  it("ポジションがなければ、区切りだけを返す", () => {
    const draft = buildRandomShiftSetupDraft({
      pattern: { kind: "dateOnly" },
      positionIds: [],
      regularClosedDays: [],
      random: () => 0,
    });

    expect(draft.map((template) => template.slots)).toEqual([
      [{ key: { kind: "allDay" }, requirements: [] }],
      [{ key: { kind: "allDay" }, requirements: [] }],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import { buildNewcomerOnlyItems } from "./newcomerOnlyPresentation";

const positions = [
  { id: "hall", name: "ホール" },
  { id: "kitchen", name: "キッチン" },
];

describe("buildNewcomerOnlyItems", () => {
  it("時間指定は、日、ポジション、時間帯の単位で、受け取った順に並べる", () => {
    // 2026-11-23は月曜日、2026-11-24は火曜日。
    const periods: NewcomerOnlyPeriod[] = [
      { date: "2026-11-23", positionId: "hall", scope: { kind: "time", start: "17:00", end: "22:00" } },
      { date: "2026-11-23", positionId: "kitchen", scope: { kind: "time", start: "09:00", end: "11:30" } },
      { date: "2026-11-24", positionId: "hall", scope: { kind: "time", start: "09:00", end: "12:00" } },
    ];

    expect(buildNewcomerOnlyItems({ periods, positions })).toEqual([
      { key: "2026-11-23-hall-17:00", date: "2026-11-23", label: "11/23(月) ホール 17:00〜22:00" },
      { key: "2026-11-23-kitchen-09:00", date: "2026-11-23", label: "11/23(月) キッチン 09:00〜11:30" },
      { key: "2026-11-24-hall-09:00", date: "2026-11-24", label: "11/24(火) ホール 09:00〜12:00" },
    ]);
  });

  it("同じ日の同じポジションに2つの時間帯があっても、keyを重ねない", () => {
    const items = buildNewcomerOnlyItems({
      periods: [
        { date: "2026-11-23", positionId: "hall", scope: { kind: "time", start: "09:00", end: "12:00" } },
        { date: "2026-11-23", positionId: "hall", scope: { kind: "time", start: "14:00", end: "18:00" } },
      ],
      positions,
    });

    expect(items.map((item) => item.key)).toEqual(["2026-11-23-hall-09:00", "2026-11-23-hall-14:00"]);
  });

  it("パターン選択は、勤務パターンの名前で出す", () => {
    const items = buildNewcomerOnlyItems({
      periods: [
        { date: "2026-11-23", positionId: "hall", scope: { kind: "shiftType", optionId: "early" } },
        { date: "2026-11-23", positionId: "kitchen", scope: { kind: "shiftType", optionId: "removed" } },
      ],
      positions,
      options: [{ id: "early", name: "早番" }],
    });

    expect(items).toEqual([
      { key: "2026-11-23-hall-early", date: "2026-11-23", label: "11/23(月) ホール 早番" },
      { key: "2026-11-23-kitchen-removed", date: "2026-11-23", label: "11/23(月) キッチン 勤務パターン" },
    ]);
  });

  it("日付選択は、日とポジションだけで出す", () => {
    const items = buildNewcomerOnlyItems({
      periods: [{ date: "2026-11-23", positionId: "kitchen", scope: { kind: "allDay" } }],
      positions,
    });

    expect(items).toEqual([{ key: "2026-11-23-kitchen-allDay", date: "2026-11-23", label: "11/23(月) キッチン" }]);
  });

  it("ポジションが1つだけの店舗では、ポジション名を省く", () => {
    const items = buildNewcomerOnlyItems({
      periods: [
        { date: "2026-11-23", positionId: "hall", scope: { kind: "time", start: "17:00", end: "22:00" } },
        { date: "2026-11-24", positionId: "hall", scope: { kind: "allDay" } },
      ],
      positions: [{ id: "hall", name: "シフト" }],
    });

    expect(items.map((item) => item.label)).toEqual(["11/23(月) 17:00〜22:00", "11/24(火)"]);
  });

  it("見習いだけの時間帯がなければ、空の一覧を返す", () => {
    expect(buildNewcomerOnlyItems({ periods: [], positions })).toEqual([]);
  });
});

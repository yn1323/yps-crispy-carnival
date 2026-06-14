import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { type AssignmentWarning, computeAssignmentWarnings } from "./assignmentWarnings";
import { BREAK_POSITION } from "./constants";
import type { PositionSegment, ShiftData } from "./types";

const staffs = [
  { id: "staff1", isSubmitted: true },
  { id: "staff2", isSubmitted: false },
];

const seg = (overrides: Partial<PositionSegment>): PositionSegment => ({
  id: "seg-1",
  positionId: "pos1",
  positionName: "ホール",
  color: "#3b82f6",
  start: "10:00",
  end: "18:00",
  ...overrides,
});

const shift = (overrides: Partial<ShiftData>): ShiftData => ({
  id: "shift-1",
  staffId: "staff1",
  staffName: "鈴木太郎",
  date: "2026-01-20",
  requestedTime: null,
  positions: [],
  ...overrides,
});

const run = (shifts: ShiftData[], pattern?: ShiftSubmissionPattern): AssignmentWarning[] =>
  computeAssignmentWarnings({ shifts, staffs, pattern });

describe("computeAssignmentWarnings", () => {
  it("勤務が割り当てられていないセルは対象外", () => {
    expect(run([shift({ requestedTime: { start: "10:00", end: "18:00" }, positions: [] })])).toEqual([]);
  });

  it("休憩のみのセルは対象外", () => {
    expect(run([shift({ positions: [seg({ positionId: BREAK_POSITION.id })] })])).toEqual([]);
  });

  it("保存前の希望プレビュー（positions＝希望と一致）では警告しない", () => {
    // 保存済み割当がないセルでは希望がpositionsにプレビュー表示されるが、希望と一致するため食い違いは出ない
    const warnings = run([
      shift({
        requestedTimes: [{ start: "10:00", end: "18:00" }],
        positions: [seg({ start: "10:00", end: "18:00" })],
      }),
    ]);
    expect(warnings).toEqual([]);
  });

  describe("NOT_SUBMITTED", () => {
    it("未提出スタッフに勤務が入っていると警告", () => {
      const warnings = run([shift({ staffId: "staff2", positions: [seg({})] })]);
      expect(warnings).toEqual([
        { code: "NOT_SUBMITTED", date: "2026-01-20", staffId: "staff2", message: "未提出のまま勤務に入っています" },
      ]);
    });

    it("未提出は希望時間外より優先（1セル1件）", () => {
      // 未提出スタッフは希望データを持たないので、NOT_SUBMITTEDのみ
      const warnings = run([shift({ staffId: "staff2", positions: [seg({ start: "06:00", end: "23:00" })] })]);
      expect(warnings.map((w) => w.code)).toEqual(["NOT_SUBMITTED"]);
    });
  });

  describe("OFF_REQUEST", () => {
    it("提出済みで希望のない日に勤務が入っていると警告", () => {
      const warnings = run([shift({ requestedTime: null, requestedTimes: [], positions: [seg({})] })]);
      expect(warnings.map((w) => w.code)).toEqual(["OFF_REQUEST"]);
    });
  });

  describe("OUTSIDE_REQUESTED_TIME（時間募集）", () => {
    it("希望枠内（短い割当）は警告しない", () => {
      const warnings = run([
        shift({
          requestedTimes: [{ start: "10:00", end: "18:00" }],
          positions: [seg({ start: "10:00", end: "15:00" })],
        }),
      ]);
      expect(warnings).toEqual([]);
    });

    it("希望枠ぴったりは警告しない", () => {
      const warnings = run([
        shift({
          requestedTimes: [{ start: "10:00", end: "18:00" }],
          positions: [seg({ start: "10:00", end: "18:00" })],
        }),
      ]);
      expect(warnings).toEqual([]);
    });

    it("終了が希望より後にはみ出すと警告", () => {
      const warnings = run([
        shift({
          requestedTimes: [{ start: "10:00", end: "18:00" }],
          positions: [seg({ start: "10:00", end: "20:00" })],
        }),
      ]);
      expect(warnings).toEqual([
        {
          code: "OUTSIDE_REQUESTED_TIME",
          date: "2026-01-20",
          staffId: "staff1",
          message: "希望時間（10:00-18:00）の外に勤務があります",
        },
      ]);
    });

    it("開始が希望より前にはみ出すと警告", () => {
      const warnings = run([
        shift({
          requestedTimes: [{ start: "10:00", end: "18:00" }],
          positions: [seg({ start: "08:00", end: "15:00" })],
        }),
      ]);
      expect(warnings.map((w) => w.code)).toEqual(["OUTSIDE_REQUESTED_TIME"]);
    });

    it("複数の希望枠は最早開始〜最遅終了の枠で判定する", () => {
      const warnings = run([
        shift({
          requestedTimes: [
            { start: "10:00", end: "12:00" },
            { start: "15:00", end: "18:00" },
          ],
          positions: [seg({ start: "13:00", end: "14:00" })],
        }),
      ]);
      // 10:00-18:00 の枠内なので警告しない（枠の隙間は許容する v1 仕様）
      expect(warnings).toEqual([]);
    });
  });

  describe("勤務区分募集", () => {
    const pattern: ShiftSubmissionPattern = {
      kind: "shiftType",
      options: [
        { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
        { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
      ],
    };

    it("希望していない勤務区分の割当を警告（区分名つき）", () => {
      const warnings = run(
        [
          shift({
            requestedShiftTypeOptionIds: ["morning"],
            positions: [seg({ start: "17:00", end: "21:00", shiftTypeOptionId: "late" })],
          }),
        ],
        pattern,
      );
      expect(warnings).toEqual([
        {
          code: "UNREQUESTED_SHIFT_TYPE",
          date: "2026-01-20",
          staffId: "staff1",
          message: "希望していない勤務区分（遅番）が入っています",
        },
      ]);
    });

    it("希望どおりの勤務区分は警告しない", () => {
      const warnings = run(
        [
          shift({
            requestedShiftTypeOptionIds: ["morning"],
            positions: [seg({ start: "09:00", end: "13:00", shiftTypeOptionId: "morning" })],
          }),
        ],
        pattern,
      );
      expect(warnings).toEqual([]);
    });

    it("勤務区分の希望がない日に割当があるとOFF_REQUEST", () => {
      const warnings = run(
        [shift({ requestedShiftTypeOptionIds: [], positions: [seg({ shiftTypeOptionId: "morning" })] })],
        pattern,
      );
      expect(warnings.map((w) => w.code)).toEqual(["OFF_REQUEST"]);
    });

    it("希望区分と未希望区分が混在する場合は未希望のみ連結して警告する", () => {
      const warnings = run(
        [
          shift({
            requestedShiftTypeOptionIds: ["morning"],
            positions: [
              seg({ id: "s1", start: "09:00", end: "13:00", shiftTypeOptionId: "morning" }),
              seg({ id: "s2", start: "17:00", end: "21:00", shiftTypeOptionId: "late" }),
            ],
          }),
        ],
        pattern,
      );
      expect(warnings).toEqual([
        {
          code: "UNREQUESTED_SHIFT_TYPE",
          date: "2026-01-20",
          staffId: "staff1",
          message: "希望していない勤務区分（遅番）が入っています",
        },
      ]);
    });
  });

  describe("日付のみ募集", () => {
    const pattern: ShiftSubmissionPattern = { kind: "dateOnly" };

    it("希望のない日に勤務が入っているとOFF_REQUEST", () => {
      const warnings = run([shift({ requestedTimes: [], positions: [seg({})] })], pattern);
      expect(warnings.map((w) => w.code)).toEqual(["OFF_REQUEST"]);
    });

    it("希望のある日は時間枠の判定をしない（警告なし）", () => {
      const warnings = run(
        [
          shift({
            requestedTimes: [{ start: "09:00", end: "22:00" }],
            positions: [seg({ start: "10:00", end: "23:00" })],
          }),
        ],
        pattern,
      );
      expect(warnings).toEqual([]);
    });
  });

  it("複数セルの警告を全件収集する", () => {
    const warnings = run([
      shift({ staffId: "staff2", date: "2026-01-20", positions: [seg({})] }),
      shift({ staffId: "staff1", date: "2026-01-21", requestedTimes: [], positions: [seg({})] }),
      shift({
        staffId: "staff1",
        date: "2026-01-22",
        requestedTimes: [{ start: "10:00", end: "18:00" }],
        positions: [seg({ start: "10:00", end: "21:00" })],
      }),
    ]);
    expect(warnings.map((w) => `${w.date}:${w.code}`)).toEqual([
      "2026-01-20:NOT_SUBMITTED",
      "2026-01-21:OFF_REQUEST",
      "2026-01-22:OUTSIDE_REQUESTED_TIME",
    ]);
  });
});

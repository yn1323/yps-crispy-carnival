import { describe, expect, it } from "vitest";
import { BREAK_POSITION } from "./constants";
import { insertProvisionalAssignments, type ProvisionalAssignmentCandidate } from "./provisionalAssignments";
import type { PositionSegment, PositionType, ShiftData } from "./types";

const date = "2026-05-21";
const nextDate = "2026-05-22";

const hall: PositionType = { id: "hall", name: "ホール", color: "#0d9488", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };
// 既定のポジションが先頭にない並びでも、既定のポジションへ寄せることを確かめる。
const positions = [kitchen, hall];

const segment = (overrides: Partial<PositionSegment> = {}): PositionSegment => ({
  id: "seg-existing",
  positionId: hall.id,
  positionName: hall.name,
  color: hall.color,
  start: "13:00",
  end: "17:00",
  ...overrides,
});

const shift = (staffId: string, shiftDate: string, overrides: Partial<ShiftData> = {}): ShiftData => ({
  id: `shift-${staffId}-${shiftDate}`,
  staffId,
  staffName: staffId,
  date: shiftDate,
  requestedTime: null,
  positions: [],
  ...overrides,
});

const candidate = (overrides: Partial<ProvisionalAssignmentCandidate> = {}): ProvisionalAssignmentCandidate => ({
  staffId: "unsubmitted",
  date,
  startTime: "10:00",
  endTime: "18:00",
  positionId: kitchen.id,
  ...overrides,
});

const insert = (shifts: ShiftData[], candidates: ProvisionalAssignmentCandidate[], unsubmitted = ["unsubmitted"]) =>
  insertProvisionalAssignments({ shifts, candidates, unsubmittedStaffIds: new Set(unsubmitted), positions });

describe("insertProvisionalAssignments", () => {
  it("未提出者の勤務のない日へ、候補を「仮」の印付きで入れる", () => {
    const result = insert([shift("unsubmitted", date)], [candidate()]);

    expect(result).toEqual({
      insertedCount: 1,
      shifts: [
        {
          id: `shift-unsubmitted-${date}`,
          staffId: "unsubmitted",
          staffName: "unsubmitted",
          date,
          requestedTime: null,
          positions: [
            {
              id: `seg-unsubmitted-${date}-provisional-0`,
              positionId: kitchen.id,
              positionName: kitchen.name,
              color: kitchen.color,
              start: "10:00",
              end: "18:00",
            },
          ],
          isProvisional: true,
        },
      ],
    });
  });

  it("提出済みのスタッフには入れない", () => {
    const submitted = shift("submitted", date);
    const result = insert([submitted], [candidate({ staffId: "submitted" })]);

    expect(result.insertedCount).toBe(0);
    expect(result.shifts).toEqual([submitted]);
  });

  it("すでに勤務のある日は変えない", () => {
    const existing = shift("unsubmitted", date, { positions: [segment()], breaks: [{ start: "14:00", end: "14:30" }] });
    const result = insert([existing], [candidate()]);

    expect(result.insertedCount).toBe(0);
    expect(result.shifts).toEqual([existing]);
  });

  it("候補のない日と、候補のないスタッフは変えない", () => {
    const otherDay = shift("unsubmitted", nextDate);
    const otherStaff = shift("another-unsubmitted", date);
    const result = insert([otherDay, otherStaff], [candidate()], ["unsubmitted", "another-unsubmitted"]);

    expect(result.insertedCount).toBe(0);
    expect(result.shifts).toEqual([otherDay, otherStaff]);
  });

  it("休憩を引き継ぐ", () => {
    const result = insert(
      [shift("unsubmitted", date)],
      [
        candidate({
          breaks: [
            { startTime: "12:00", endTime: "13:00" },
            { startTime: "15:00", endTime: "15:15" },
          ],
        }),
      ],
    );

    expect(result.shifts[0].breaks).toEqual([
      { start: "12:00", end: "13:00" },
      { start: "15:00", end: "15:15" },
    ]);
  });

  it("休憩のない候補では、休憩の項目を足さない", () => {
    const result = insert([shift("unsubmitted", date)], [candidate({ breaks: [] })]);

    expect(result.shifts).toHaveLength(1);
    expect(Object.hasOwn(result.shifts[0], "breaks")).toBe(false);
  });

  it("勤務パターンのIDを引き継ぐ", () => {
    const result = insert([shift("unsubmitted", date)], [candidate({ optionId: "early" })]);

    expect(result.shifts[0].positions).toEqual([
      {
        id: `seg-unsubmitted-${date}-provisional-0`,
        positionId: kitchen.id,
        positionName: kitchen.name,
        color: kitchen.color,
        start: "10:00",
        end: "18:00",
        shiftTypeOptionId: "early",
      },
    ]);
  });

  it("存在しないポジションの候補は、既定のポジションで入れる", () => {
    const result = insert([shift("unsubmitted", date)], [candidate({ positionId: "removed-position" })]);

    expect(result.shifts[0].positions).toEqual([
      {
        id: `seg-unsubmitted-${date}-provisional-0`,
        positionId: hall.id,
        positionName: hall.name,
        color: hall.color,
        start: "10:00",
        end: "18:00",
      },
    ]);
  });

  it("同じ日に候補が複数あれば、開始順に並べて1日分として数える", () => {
    const result = insert(
      [shift("unsubmitted", date)],
      [
        candidate({
          startTime: "15:00",
          endTime: "18:00",
          positionId: hall.id,
          breaks: [{ startTime: "16:00", endTime: "16:15" }],
        }),
        candidate({ startTime: "10:00", endTime: "13:00", breaks: [{ startTime: "11:00", endTime: "11:15" }] }),
      ],
    );

    expect(result.insertedCount).toBe(1);
    expect(
      result.shifts[0].positions.map(({ id, positionId, start, end }) => ({ id, positionId, start, end })),
    ).toEqual([
      { id: `seg-unsubmitted-${date}-provisional-0`, positionId: kitchen.id, start: "10:00", end: "13:00" },
      { id: `seg-unsubmitted-${date}-provisional-1`, positionId: hall.id, start: "15:00", end: "18:00" },
    ]);
    expect(result.shifts[0].breaks).toEqual([
      { start: "11:00", end: "11:15" },
      { start: "16:00", end: "16:15" },
    ]);
  });

  it("入れた日数を数え、対象外の日は元のまま返す", () => {
    const existing = shift("unsubmitted", nextDate, { positions: [segment()] });
    const submitted = shift("submitted", date);
    const result = insert(
      [shift("unsubmitted", date), existing, shift("second-unsubmitted", nextDate), submitted],
      [
        candidate(),
        candidate({ date: nextDate }),
        candidate({ staffId: "second-unsubmitted", date: nextDate }),
        candidate({ staffId: "submitted" }),
      ],
      ["unsubmitted", "second-unsubmitted"],
    );

    expect(result.insertedCount).toBe(2);
    expect(result.shifts.map((item) => [item.id, item.isProvisional ?? false, item.positions.length])).toEqual([
      [`shift-unsubmitted-${date}`, true, 1],
      [`shift-unsubmitted-${nextDate}`, false, 1],
      [`shift-second-unsubmitted-${nextDate}`, true, 1],
      [`shift-submitted-${date}`, false, 0],
    ]);
    expect(result.shifts[1]).toBe(existing);
    expect(result.shifts[3]).toBe(submitted);
  });

  it("希望の情報を残したまま勤務を入れる", () => {
    const result = insert(
      [shift("unsubmitted", date, { requestedTime: null, requestedTimes: [], requestedShiftTypeOptionIds: [] })],
      [candidate()],
    );

    expect(result.shifts[0]).toMatchObject({
      requestedTime: null,
      requestedTimes: [],
      requestedShiftTypeOptionIds: [],
      isProvisional: true,
    });
  });

  it("休憩のポジションだけが残る日は、勤務のない日として候補を入れる", () => {
    const result = insert(
      [shift("unsubmitted", date, { positions: [segment({ positionId: BREAK_POSITION.id })] })],
      [candidate()],
    );

    expect(result.insertedCount).toBe(1);
    expect(result.shifts[0].positions.map((position) => position.positionId)).toEqual([kitchen.id]);
  });

  it("候補がなければ何も変えない", () => {
    const shifts = [shift("unsubmitted", date)];
    expect(insert(shifts, [])).toEqual({ shifts, insertedCount: 0 });
  });
});

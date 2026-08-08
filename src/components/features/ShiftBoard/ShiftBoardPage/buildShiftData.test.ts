import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import type { StaffType } from "@/src/domains/shift/types";
import type { ShiftBoardData } from "../types";
import { buildShiftData } from "./buildShiftData";

const date = "2026-05-21";
const secondDate = "2026-05-22";
const shopId = "shop1" as Id<"shops">;
const recruitmentId = "recruitment1" as Id<"recruitments">;
const staffId = "staff1" as Id<"staffs">;
const secondStaffId = "staff2" as Id<"staffs">;
const positionId = "position1" as Id<"positions">;
const secondPositionId = "position2" as Id<"positions">;
const missingPositionId = "missing-position" as Id<"positions">;

const staff: StaffType = { id: staffId, name: "田中 太郎", isSubmitted: true };
const secondStaff: StaffType = { id: secondStaffId, name: "鈴木 花子", isSubmitted: true };

const baseData: ShiftBoardData = {
  shopId,
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  recruitment: {
    _id: recruitmentId,
    periodStart: date,
    periodEnd: secondDate,
    deadline: "2026-05-18",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    reminderScheduledAt: null,
    lastReminderSentAt: null,
    draftSavedAt: null,
  },
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  staffs: [
    { _id: staffId, name: staff.name, isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: secondStaffId, name: secondStaff.name, isSubmitted: true, wasSubmittedAtDraft: false },
  ],
  requestedSlots: [],
  requestedDates: [],
  shiftAssignments: [],
  positions: [
    { _id: positionId, name: "ホール", color: "#0d9488", isDefault: true },
    { _id: secondPositionId, name: "キッチン", color: "#f97316", isDefault: false },
  ],
  timeRange: { start: 5, end: 23, unit: 30, editableStartMinutes: 330, editableEndMinutes: 1350 },
};

type DataOverrides = Partial<Omit<ShiftBoardData, "recruitment">> & {
  recruitment?: Partial<ShiftBoardData["recruitment"]>;
};

const makeData = ({ recruitment, ...overrides }: DataOverrides = {}): ShiftBoardData => ({
  ...baseData,
  ...overrides,
  recruitment: { ...baseData.recruitment, ...recruitment },
});

describe("buildShiftData", () => {
  it("時間指定の複数希望を時刻順に並べ、希望全体のspanと各時間帯を保持する", () => {
    const shifts = buildShiftData(
      makeData({
        requestedSlots: [
          { staffId, date, startTime: "15:00", endTime: "18:00" },
          { staffId, date, startTime: "10:00", endTime: "12:00" },
        ],
      }),
      [staff],
      [date],
    );

    expect(shifts).toEqual([
      {
        id: `shift-${staffId}-${date}`,
        staffId,
        staffName: staff.name,
        date,
        requestedTime: { start: "10:00", end: "18:00" },
        requestedTimes: [
          { start: "10:00", end: "12:00" },
          { start: "15:00", end: "18:00" },
        ],
        requestedShiftTypeOptionIds: undefined,
        positions: [
          {
            id: `seg-${staffId}-${date}-0`,
            positionId,
            positionName: "ホール",
            color: "#0d9488",
            start: "10:00",
            end: "12:00",
          },
          {
            id: `seg-${staffId}-${date}-1`,
            positionId,
            positionName: "ホール",
            color: "#0d9488",
            start: "15:00",
            end: "18:00",
          },
        ],
      },
    ]);
  });

  it("日付指定の希望を編集可能範囲いっぱいの時間へ変換する", () => {
    const shifts = buildShiftData(
      makeData({
        submissionPattern: { kind: "dateOnly" },
        requestedDates: [{ staffId, date }],
      }),
      [staff],
      [date],
    );

    expect(shifts[0]).toMatchObject({
      requestedTime: { start: "05:30", end: "22:30" },
      requestedTimes: [{ start: "05:30", end: "22:30" }],
      positions: [
        {
          id: `seg-${staffId}-${date}`,
          start: "05:30",
          end: "22:30",
          positionId,
        },
      ],
    });
  });

  it("勤務区分希望はoptionIdを優先し、旧データは時間一致するoptionIdへ復元する", () => {
    const shifts = buildShiftData(
      makeData({
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
          ],
        },
        requestedSlots: [
          { staffId, date, startTime: "17:00", endTime: "21:00", optionId: null },
          { staffId, date, startTime: "10:00", endTime: "14:00", optionId: "morning" },
        ],
      }),
      [staff],
      [date],
    );

    expect(shifts[0].requestedShiftTypeOptionIds).toEqual(["morning", "late"]);
    expect(shifts[0].requestedTimes).toEqual([
      { start: "10:00", end: "14:00" },
      { start: "17:00", end: "21:00" },
    ]);
    expect(shifts[0].positions.map(({ start, end, shiftTypeOptionId }) => ({ start, end, shiftTypeOptionId }))).toEqual(
      [
        { start: "10:00", end: "14:00", shiftTypeOptionId: "morning" },
        { start: "17:00", end: "21:00", shiftTypeOptionId: "late" },
      ],
    );
  });

  it("対応する勤務区分がない旧希望は希望時間だけを保持し、誤った割当を生成しない", () => {
    const shifts = buildShiftData(
      makeData({
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
        },
        requestedSlots: [{ staffId, date, startTime: "10:00", endTime: "15:00", optionId: null }],
      }),
      [staff],
      [date],
    );

    expect(shifts[0]).toMatchObject({
      requestedTime: { start: "10:00", end: "15:00" },
      requestedTimes: [{ start: "10:00", end: "15:00" }],
      requestedShiftTypeOptionIds: [],
      positions: [],
    });
  });

  it("店休日は希望や保存済み割当があっても空セルにする", () => {
    const shifts = buildShiftData(
      makeData({
        recruitment: { shopClosedDates: [date] },
        requestedSlots: [{ staffId, date, startTime: "10:00", endTime: "18:00" }],
        requestedDates: [{ staffId, date }],
        shiftAssignments: [{ staffId, date, startTime: "11:00", endTime: "17:00", positionId }],
      }),
      [staff],
      [date],
    );

    expect(shifts).toEqual([
      {
        id: `shift-${staffId}-${date}`,
        staffId,
        staffName: staff.name,
        date,
        requestedTime: null,
        positions: [],
      },
    ]);
  });

  it("保存済み割当を希望より優先し、入力順に依存せず時刻順で実ポジションへ変換する", () => {
    const shifts = buildShiftData(
      makeData({
        requestedSlots: [{ staffId, date, startTime: "10:00", endTime: "18:00" }],
        shiftAssignments: [
          { staffId, date, startTime: "15:00", endTime: "19:00", positionId: secondPositionId },
          { staffId, date, startTime: "09:00", endTime: "12:00", positionId },
        ],
      }),
      [staff],
      [date],
    );

    expect(shifts[0].requestedTime).toEqual({ start: "10:00", end: "18:00" });
    expect(shifts[0].positions).toEqual([
      {
        id: `seg-${staffId}-${date}-0`,
        positionId,
        positionName: "ホール",
        color: "#0d9488",
        start: "09:00",
        end: "12:00",
        shiftTypeOptionId: undefined,
      },
      {
        id: `seg-${staffId}-${date}-1`,
        positionId: secondPositionId,
        positionName: "キッチン",
        color: "#f97316",
        start: "15:00",
        end: "19:00",
        shiftTypeOptionId: undefined,
      },
    ]);
  });

  it("時間方式の保存済み割当は同じ実ポジションの完全隣接区間を一本で表示する", () => {
    const shifts = buildShiftData(
      makeData({
        shiftAssignments: [
          { staffId, date, startTime: "09:00", endTime: "14:00", positionId },
          { staffId, date, startTime: "08:30", endTime: "09:00", positionId },
        ],
      }),
      [staff],
      [date],
    );

    expect(shifts[0].positions).toEqual([
      {
        id: `seg-${staffId}-${date}-0`,
        positionId,
        positionName: "ホール",
        color: "#0d9488",
        start: "08:30",
        end: "14:00",
        shiftTypeOptionId: undefined,
      },
    ]);
  });

  it("時間方式でも空白・別ポジション・重複を正規化で隠さない", () => {
    const shifts = buildShiftData(
      makeData({
        shiftAssignments: [
          { staffId, date, startTime: "09:00", endTime: "11:00", positionId },
          { staffId, date, startTime: "12:00", endTime: "13:00", positionId },
          { staffId, date, startTime: "13:00", endTime: "14:00", positionId: secondPositionId },
          { staffId: secondStaffId, date, startTime: "09:00", endTime: "12:00", positionId },
          { staffId: secondStaffId, date, startTime: "11:00", endTime: "13:00", positionId },
          { staffId: secondStaffId, date, startTime: "13:00", endTime: "14:00", positionId },
        ],
      }),
      [staff, secondStaff],
      [date],
    );

    expect(shifts[0].positions).toHaveLength(3);
    expect(shifts[1].positions).toHaveLength(3);
  });

  it("保存済み勤務区分割当もoptionIdを優先し、旧データは時間一致で復元する", () => {
    const shifts = buildShiftData(
      makeData({
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
          ],
        },
        shiftAssignments: [
          { staffId, date, startTime: "17:00", endTime: "21:00", positionId, optionId: "late" },
          { staffId, date, startTime: "09:00", endTime: "13:00", positionId, optionId: null },
        ],
      }),
      [staff],
      [date],
    );

    expect(shifts[0].positions.map((position) => position.shiftTypeOptionId)).toEqual(["morning", "late"]);
  });

  it("削除済みpositionIdの割当は現在のデフォルトポジションへフォールバックする", () => {
    const shifts = buildShiftData(
      makeData({
        positions: [
          { _id: secondPositionId, name: "キッチン", color: "#f97316", isDefault: false },
          { _id: positionId, name: "ホール", color: "#0d9488", isDefault: true },
        ],
        shiftAssignments: [{ staffId, date, startTime: "10:00", endTime: "18:00", positionId: missingPositionId }],
      }),
      [staff],
      [date],
    );

    expect(shifts[0].positions[0]).toMatchObject({
      positionId,
      positionName: "ホール",
      color: "#0d9488",
    });
  });

  it("削除済みpositionと実デフォルトの隣接区間は異なる保存IDとして統合しない", () => {
    const shifts = buildShiftData(
      makeData({
        shiftAssignments: [
          { staffId, date, startTime: "09:00", endTime: "12:00", positionId: missingPositionId },
          { staffId, date, startTime: "12:00", endTime: "15:00", positionId },
        ],
      }),
      [staff],
      [date],
    );

    expect(
      shifts[0].positions.map(({ positionId: displayedPositionId, start, end }) => ({
        positionId: displayedPositionId,
        start,
        end,
      })),
    ).toEqual([
      { positionId, start: "09:00", end: "12:00" },
      { positionId, start: "12:00", end: "15:00" },
    ]);
  });

  it("ポジション定義が空でも標準ポジションで希望を表示する", () => {
    const shifts = buildShiftData(
      makeData({
        positions: [],
        requestedSlots: [{ staffId, date, startTime: "10:00", endTime: "18:00" }],
      }),
      [staff],
      [date],
    );

    expect(shifts[0].positions[0]).toMatchObject({
      positionId: DEFAULT_POSITION.id,
      positionName: DEFAULT_POSITION.name,
      color: DEFAULT_POSITION.color,
    });
  });

  it("下書き保存後は保存時提出済みの新しい希望を自動反映せず、保存時未提出なら反映する", () => {
    const shifts = buildShiftData(
      makeData({
        recruitment: { draftSavedAt: 1_000 },
        staffs: [
          { _id: staffId, name: staff.name, isSubmitted: true, wasSubmittedAtDraft: true },
          { _id: secondStaffId, name: secondStaff.name, isSubmitted: true, wasSubmittedAtDraft: false },
        ],
        requestedSlots: [
          { staffId, date, startTime: "10:00", endTime: "18:00" },
          { staffId: secondStaffId, date, startTime: "11:00", endTime: "17:00" },
        ],
      }),
      [staff, secondStaff],
      [date],
    );

    expect(shifts[0]).toMatchObject({
      staffId,
      requestedTime: { start: "10:00", end: "18:00" },
      positions: [],
    });
    expect(shifts[1]).toMatchObject({
      staffId: secondStaffId,
      requestedTime: { start: "11:00", end: "17:00" },
      positions: [{ start: "11:00", end: "17:00" }],
    });
  });

  it("希望も割当もない場合は空のシフトを生成する", () => {
    const shifts = buildShiftData(makeData(), [staff], [date]);

    expect(shifts).toEqual([
      {
        id: `shift-${staffId}-${date}`,
        staffId,
        staffName: staff.name,
        date,
        requestedTime: null,
        requestedTimes: undefined,
        requestedShiftTypeOptionIds: undefined,
        positions: [],
      },
    ]);
  });

  it("希望と割当を別staffや別日付のセルへ混入させない", () => {
    const shifts = buildShiftData(
      makeData({
        requestedSlots: [{ staffId, date, startTime: "10:00", endTime: "18:00" }],
        shiftAssignments: [{ staffId, date, startTime: "11:00", endTime: "17:00", positionId }],
      }),
      [staff, secondStaff],
      [date, secondDate],
    );

    expect(
      shifts.map((shift) => ({
        staffId: shift.staffId,
        date: shift.date,
        requestedTime: shift.requestedTime,
        positions: shift.positions.map(({ start, end }) => ({ start, end })),
      })),
    ).toEqual([
      {
        staffId,
        date,
        requestedTime: { start: "10:00", end: "18:00" },
        positions: [{ start: "11:00", end: "17:00" }],
      },
      { staffId, date: secondDate, requestedTime: null, positions: [] },
      { staffId: secondStaffId, date, requestedTime: null, positions: [] },
      { staffId: secondStaffId, date: secondDate, requestedTime: null, positions: [] },
    ]);
  });

  it("staffとdateの指定順で全セルを決定的に生成する", () => {
    const shifts = buildShiftData(makeData(), [secondStaff, staff], [secondDate, date]);

    expect(shifts.map((shift) => shift.id)).toEqual([
      `shift-${secondStaffId}-${secondDate}`,
      `shift-${secondStaffId}-${date}`,
      `shift-${staffId}-${secondDate}`,
      `shift-${staffId}-${date}`,
    ]);
    expect(buildShiftData(makeData(), [], [date])).toEqual([]);
    expect(buildShiftData(makeData(), [staff], [])).toEqual([]);
  });
});

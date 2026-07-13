import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildShiftTypeDailyViewModel } from "./script";

const submissionPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "late", name: "遅番", startTime: "13:00", endTime: "18:00", sortOrder: 2 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 1 },
  ],
};

const staffs: StaffType[] = [
  { id: "staff-submitted", name: "田中", isSubmitted: true },
  { id: "staff-unsubmitted", name: "佐藤", isSubmitted: false },
];

const shifts: ShiftData[] = [
  {
    id: "shift-submitted",
    staffId: "staff-submitted",
    staffName: "田中",
    date: "2026-06-01",
    requestedTime: { start: "09:00", end: "13:00" },
    requestedShiftTypeOptionIds: ["early"],
    positions: [
      {
        id: "position-early",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "09:00",
        end: "13:00",
        shiftTypeOptionId: "early",
      },
    ],
  },
];

describe("buildShiftTypeDailyViewModel", () => {
  it("勤務区分を並べ替え、件数・希望・割当を描画値へまとめる", () => {
    const viewModel = buildShiftTypeDailyViewModel({
      submissionPattern,
      shifts,
      staffs,
      selectedDate: "2026-06-01",
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map([["staff-submitted", ["必要人数を下回っています"]]]),
    });

    expect(viewModel.optionColumns.map(({ key, timeLabel, countLabel }) => ({ key, timeLabel, countLabel }))).toEqual([
      { key: "early", timeLabel: "09:00〜13:00", countLabel: "1人" },
      { key: "late", timeLabel: "13:00〜18:00", countLabel: "0人" },
    ]);
    expect(viewModel.minimumTableWidth).toBe(670);
    expect(viewModel.columnWidths).toEqual({ staff: 220, request: 150, option: 150 });
    expect(viewModel.rows.map(({ key }) => key)).toEqual(["staff-submitted", "staff-unsubmitted"]);
    expect(viewModel.rows[0].warningMessages).toEqual(["必要人数を下回っています"]);
    expect(viewModel.rows[0].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "early", label: "早番" },
    ]);
    expect(
      viewModel.rows[0].cells.map(({ key, assigned, ariaLabel, symbol }) => ({ key, assigned, ariaLabel, symbol })),
    ).toEqual([
      { key: "early", assigned: true, ariaLabel: "田中 早番 勤務あり", symbol: "○" },
      { key: "late", assigned: false, ariaLabel: "田中 遅番 勤務なし", symbol: "×" },
    ]);
    expect(viewModel.rows[0].staff).toBe(staffs[0]);
    expect(viewModel.rows[0].cells[0].option).toBe(submissionPattern.options[1]);
  });

  it("提出状態・確定表示・定休日を表示状態へ変換する", () => {
    const viewModel = buildShiftTypeDailyViewModel({
      submissionPattern,
      shifts: [],
      staffs,
      selectedDate: "2026-06-01",
      holidays: ["2026-06-01"],
      isConfirmedDisplay: true,
      warningMessagesByStaffId: new Map(),
    });

    expect(viewModel.isShopClosedDate).toBe(true);
    expect(viewModel.requestHeaderLabel).toBe("確定");
    expect(viewModel.rows[0].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "rest", label: "休み" },
    ]);
    expect(viewModel.rows[1].isStaffNameMuted).toBe(true);
    expect(viewModel.rows[1].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "unsubmitted", label: "未提出" },
    ]);
  });

  it("設定から削除された希望区分は従来の代替表示を使う", () => {
    const viewModel = buildShiftTypeDailyViewModel({
      submissionPattern,
      shifts: [
        {
          ...shifts[0],
          requestedShiftTypeOptionIds: ["removed-option"],
          positions: [],
        },
      ],
      staffs: [staffs[0]],
      selectedDate: "2026-06-01",
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map(),
    });

    expect(viewModel.rows[0].requestBadges).toEqual([
      {
        key: "removed-option",
        label: "勤務区分",
        bg: "gray.100",
        color: "gray.700",
      },
    ]);
  });
});

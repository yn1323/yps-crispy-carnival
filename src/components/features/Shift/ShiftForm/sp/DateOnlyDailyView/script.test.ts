import { describe, expect, it } from "vitest";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildSPDateOnlyDailyViewModel } from "./script";

describe("buildSPDateOnlyDailyViewModel", () => {
  it("選択日の希望・割当・提出状態を描画用の行へ変換する", () => {
    const submitted: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const unsubmitted: StaffType = { id: "staff-2", name: "佐藤", isSubmitted: false };
    const shifts: ShiftData[] = [
      {
        id: "shift-1",
        staffId: submitted.id,
        staffName: submitted.name,
        date: "2026-06-01",
        requestedTime: { start: "00:00", end: "23:59" },
        positions: [
          {
            id: "position-1",
            positionId: "date-only",
            positionName: "勤務",
            color: "#000",
            start: "00:00",
            end: "23:59",
          },
        ],
      },
    ];

    const viewModel = buildSPDateOnlyDailyViewModel({
      dates: ["2026-06-01"],
      selectedDate: "2026-06-01",
      holidays: [],
      staffs: [submitted, unsubmitted],
      shifts,
      isConfirmedDisplay: false,
    });

    expect(viewModel.assignedCount).toBe(1);
    expect(viewModel.rows).toMatchObject([
      { requested: true, assigned: true, statusLabel: "希望あり", statusTone: "positive", isNameMuted: false },
      { requested: false, assigned: false, statusLabel: "未提出", statusTone: "warning", isNameMuted: true },
    ]);
  });

  it("確定表示では希望の有無を勤務ラベルへ変換する", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const viewModel = buildSPDateOnlyDailyViewModel({
      dates: ["2026-06-01"],
      selectedDate: "2026-06-01",
      holidays: ["2026-06-01"],
      staffs: [staff],
      shifts: [],
      isConfirmedDisplay: true,
    });

    expect(viewModel.isShopClosedDate).toBe(true);
    expect(viewModel.rows[0].statusLabel).toBe("勤務なし");
  });
});

import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildSPShiftTypeDailyViewModel } from "./script";

const submissionPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "late", name: "遅番", startTime: "13:00", endTime: "18:00", sortOrder: 2 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 1 },
  ],
};

describe("buildSPShiftTypeDailyViewModel", () => {
  it("勤務区分を並べ替え、希望・割当・件数をカード表示値へ変換する", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const shifts: ShiftData[] = [
      {
        id: "shift-1",
        staffId: staff.id,
        staffName: staff.name,
        date: "2026-06-01",
        requestedTime: { start: "09:00", end: "13:00" },
        requestedShiftTypeOptionIds: ["early"],
        positions: [
          {
            id: "position-1",
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

    const viewModel = buildSPShiftTypeDailyViewModel({
      submissionPattern,
      shifts,
      staffs: [staff],
      isConfirmedDisplay: false,
    });

    expect(viewModel.counts.map(({ key }) => key)).toEqual(["early", "late"]);
    expect(viewModel.counts.map(({ countLabel }) => countLabel)).toEqual(["1人", "0人"]);
    expect(Object.keys(viewModel.counts[0]).sort()).toEqual(["color", "countLabel", "key", "name"]);
    expect(viewModel.staffCards[0].requestBadges).toMatchObject([{ key: "early", label: "早番" }]);
    expect(viewModel.staffCards[0].options).toMatchObject([
      { name: "早番", timeLabel: "09:00〜13:00", assigned: true },
      { name: "遅番", timeLabel: "13:00〜18:00", assigned: false },
    ]);
    expect(Object.keys(viewModel.staffCards[0].options[0]).sort()).toEqual([
      "assigned",
      "color",
      "name",
      "option",
      "timeLabel",
    ]);
  });

  it("未提出スタッフの状態を表示値へ変換する", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: false };
    const viewModel = buildSPShiftTypeDailyViewModel({
      submissionPattern,
      shifts: [],
      staffs: [staff],
      isConfirmedDisplay: true,
    });

    expect(viewModel.staffCards[0]).toMatchObject({
      isNameMuted: true,
      requestSectionLabel: "確定",
      requestBadges: [{ key: "unsubmitted", label: "未提出" }],
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildShiftTypeDailyPresentation } from "./shiftTypeDailyPresentation";

const submissionPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "late", name: "遅番", startTime: "13:00", endTime: "18:00", sortOrder: 2 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 1 },
  ],
};

describe("buildShiftTypeDailyPresentation", () => {
  it("区分・件数・希望・割当をPCとSPで共有する表示値へ変換する", () => {
    const submitted: StaffType = { id: "staff-submitted", name: "田中", isSubmitted: true };
    const unsubmitted: StaffType = { id: "staff-unsubmitted", name: "佐藤", isSubmitted: false };
    const shift = shiftData(submitted.id, {
      requestedShiftTypeOptionIds: ["early", "removed-option"],
      shiftTypeOptionId: "early",
    });

    const presentation = buildShiftTypeDailyPresentation({
      submissionPattern,
      shifts: [shift],
      staffs: [submitted, unsubmitted],
      shiftByStaffId: new Map([[submitted.id, shift]]),
      isConfirmedDisplay: false,
    });

    expect(presentation.options.map(({ key, timeLabel, countLabel }) => ({ key, timeLabel, countLabel }))).toEqual([
      { key: "early", timeLabel: "09:00〜13:00", countLabel: "1人" },
      { key: "late", timeLabel: "13:00〜18:00", countLabel: "0人" },
    ]);
    expect(presentation.staffs[0].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "early", label: "早番" },
      { key: "removed-option", label: "勤務区分" },
    ]);
    expect(presentation.staffs[0].assignments.map(({ key, assigned }) => ({ key, assigned }))).toEqual([
      { key: "early", assigned: true },
      { key: "late", assigned: false },
    ]);
    expect(presentation.staffs[1]).toMatchObject({
      isNameMuted: true,
      requestSectionLabel: "希望",
      requestBadges: [{ key: "unsubmitted", label: "未提出" }],
    });
  });

  it("提出済みで希望がない場合は確定表示でも休みとして扱う", () => {
    const staff: StaffType = { id: "staff-rest", name: "鈴木", isSubmitted: true };
    const presentation = buildShiftTypeDailyPresentation({
      submissionPattern,
      shifts: [],
      staffs: [staff],
      shiftByStaffId: new Map(),
      isConfirmedDisplay: true,
    });

    expect(presentation.staffs[0]).toMatchObject({
      requestSectionLabel: "確定",
      requestBadges: [{ key: "rest", label: "休み" }],
    });
  });
});

function shiftData(
  staffId: string,
  {
    requestedShiftTypeOptionIds,
    shiftTypeOptionId,
  }: { requestedShiftTypeOptionIds: string[]; shiftTypeOptionId: string },
): ShiftData {
  return {
    id: `shift-${staffId}`,
    staffId,
    staffName: "田中",
    date: "2026-06-01",
    requestedTime: null,
    requestedShiftTypeOptionIds,
    positions: [
      {
        id: `position-${staffId}`,
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "09:00",
        end: "13:00",
        shiftTypeOptionId,
      },
    ],
  };
}

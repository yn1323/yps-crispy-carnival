import { describe, expect, it } from "vitest";
import type { ShiftData } from "@/src/domains/shift/types";
import { buildShiftPopoverViewModel } from "./script";

describe("buildShiftPopoverViewModel", () => {
  it("複数希望と休憩を除いた勤務位置を表示値へ変換する", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      requestedTimes: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
      positions: [
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "13:00", end: "17:00" },
        { id: "break", positionId: "break", positionName: "休憩", color: "#000", start: "12:00", end: "13:00" },
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    const viewModel = buildShiftPopoverViewModel({ shift, isStaffSubmitted: false, isReadOnly: false });

    expect(viewModel.requestLabel).toBe("希望：09:00〜12:00 / 13:00〜17:00");
    expect(viewModel.showUnsubmittedBadge).toBe(true);
    expect(viewModel.segments).toEqual([
      { id: "work-1", timeLabel: "09:00〜12:00" },
      { id: "work-2", timeLabel: "13:00〜17:00" },
    ]);
  });

  it("読み取り専用では希望と削除操作を表示しない", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [],
    };

    expect(buildShiftPopoverViewModel({ shift, isStaffSubmitted: true, isReadOnly: true })).toMatchObject({
      requestLabel: null,
      showUnsubmittedBadge: false,
      showDeleteActions: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ShiftData } from "@/src/domains/shift/types";
import { buildSPDailyCardViewModel, getAssignedRange, timeToPercentage } from "./script";

describe("getAssignedRange", () => {
  it("休憩を除外して勤務範囲を返す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "13:00", end: "18:00" },
        { id: "break", positionId: "break", positionName: "休憩", color: "#000", start: "12:00", end: "13:00" },
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    expect(getAssignedRange(shift)).toEqual(["09:00", "18:00"]);
  });

  it("勤務がなければnullを返す", () => {
    expect(getAssignedRange(undefined)).toBeNull();
  });
});

describe("timeToPercentage", () => {
  it("表示時間内の位置を百分率へ変換する", () => {
    expect(timeToPercentage("13:00", { start: 9, end: 17, unit: 30 })).toBe(50);
  });
});

describe("buildSPDailyCardViewModel", () => {
  it("希望・勤務・勤務間の休憩を描画用の値へ変換する", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: { start: "09:00", end: "17:00" },
      positions: [
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "13:00", end: "17:00" },
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    const viewModel = buildSPDailyCardViewModel(shift, { start: 9, end: 17, unit: 30 });

    expect(viewModel.assignedTimeLabel).toBe("09:00–17:00");
    expect(viewModel.requestedBars).toEqual([{ key: "09:00-17:00-0", leftPercentage: 0, widthPercentage: 100 }]);
    expect(viewModel.workBars.map(({ key }) => key)).toEqual(["work-1", "work-2"]);
    expect(viewModel.breakBars).toEqual([{ key: "break-12:00-13:00", leftPercentage: 37.5, widthPercentage: 12.5 }]);
  });
});

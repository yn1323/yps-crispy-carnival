import { describe, expect, it } from "vitest";
import type { ShiftData, TimeRange } from "@/src/domains/shift/types";
import { buildShiftBarViewModel } from "./script";

const timeRange: TimeRange = { start: 9, end: 17, unit: 30 };

describe("buildShiftBarViewModel", () => {
  it("希望、勤務、勤務間の休憩を描画位置へ変換する", () => {
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

    const viewModel = buildShiftBarViewModel({ shift, timeRange, hourWidth: 100, isReadOnly: false });

    expect(viewModel).toMatchObject({ left: 30, width: 800, workLabel: { left: 0, width: 800, label: "09:00–17:00" } });
    expect(viewModel?.requestedBars).toEqual([
      { key: "09:00-17:00-0", left: 0, width: 800, label: "希望：09:00-17:00" },
    ]);
    expect(viewModel?.workBars.map(({ key, left, width }) => ({ key, left, width }))).toEqual([
      { key: "work-1", left: 0, width: 300 },
      { key: "work-2", left: 400, width: 400 },
    ]);
    expect(viewModel?.breakBars).toEqual([{ key: "break-12:00-13:00", left: 300, width: 100 }]);
  });

  it("希望も位置もないシフトは描画しない", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [],
    };

    expect(buildShiftBarViewModel({ shift, timeRange, hourWidth: 100, isReadOnly: false })).toBeNull();
  });

  it("連結リサイズ中は境界を両側へ反映し、休憩と勤務ラベルを隠す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
        { id: "work-2", positionId: "default", positionName: "勤務", color: "#000", start: "12:00", end: "17:00" },
      ],
    };

    const viewModel = buildShiftBarViewModel({
      shift,
      timeRange,
      hourWidth: 100,
      isReadOnly: false,
      currentMinutes: 750,
      linkedTarget: {
        prevPosition: { positionId: "work-1", positionColor: "#000" },
        nextPosition: { positionId: "work-2", positionColor: "#000" },
        boundaryMinutes: 720,
      },
    });

    expect(viewModel?.workBars.map(({ key, left, width, isResizing }) => ({ key, left, width, isResizing }))).toEqual([
      { key: "work-1", left: 0, width: 350, isResizing: true },
      { key: "work-2", left: 350, width: 450, isResizing: true },
    ]);
    expect(viewModel?.breakBars).toEqual([]);
    expect(viewModel?.workLabel).toBeNull();
  });

  it("リサイズ後の幅が最小単位未満になる位置を表示しない", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "12:00" },
      ],
    };

    const viewModel = buildShiftBarViewModel({
      shift,
      timeRange,
      hourWidth: 100,
      isReadOnly: false,
      currentMinutes: 555,
      linkedTarget: {
        prevPosition: { positionId: "work-1", positionColor: "#000" },
        nextPosition: null,
        boundaryMinutes: 720,
      },
    });

    expect(viewModel?.workBars).toEqual([]);
  });
});

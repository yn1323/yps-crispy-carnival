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

  it("勤務の両端だけ角を丸め、隣り合う境目と、休憩の斜線で埋める空きの両側は丸めない", () => {
    const segment = (id: string, start: string, end: string) => ({
      id,
      positionId: "default",
      positionName: "勤務",
      color: "#000",
      start,
      end,
    });
    const shapesOf = (positions: ShiftData["positions"]) =>
      buildShiftBarViewModel({
        shift: {
          id: "shift-1",
          staffId: "staff-1",
          staffName: "田中",
          date: "2026-06-01",
          requestedTime: null,
          positions,
        },
        timeRange,
        hourWidth: 100,
        isReadOnly: false,
      })?.workBars.map((bar) => bar.edgeShape);

    expect(shapesOf([segment("a", "09:00", "17:00")])).toEqual(["isolated"]);
    // 隣り合う3つの勤務。
    expect(
      shapesOf([segment("a", "09:00", "11:00"), segment("b", "11:00", "13:00"), segment("c", "13:00", "17:00")]),
    ).toEqual(["start", "middle", "end"]);
    // 12:00〜13:00が空いた2つの勤務。空きは休憩の斜線で埋めるため、空きの側は丸めない。
    expect(shapesOf([segment("a", "09:00", "12:00"), segment("b", "13:00", "17:00")])).toEqual(["start", "end"]);
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

  describe("時刻で入れた休憩", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        { id: "work-1", positionId: "default", positionName: "勤務", color: "#000", start: "09:00", end: "17:00" },
      ],
      breaks: [{ start: "12:00", end: "13:00" }],
    };
    const resizingEnd = {
      prevPosition: { positionId: "work-1", positionColor: "#000" },
      nextPosition: null,
      boundaryMinutes: 17 * 60,
    };
    const breaksOf = (options: Partial<Parameters<typeof buildShiftBarViewModel>[0]>) =>
      buildShiftBarViewModel({
        shift,
        timeRange,
        hourWidth: 100,
        isReadOnly: false,
        ...options,
      })?.explicitBreakBars.map(({ left, width }) => ({ left, width }));

    it("勤務の長さを変えている間も、休憩を出し続ける", () => {
      expect(breaksOf({})).toEqual([{ left: 300, width: 100 }]);
      // 終了を15:00まで縮めている途中。
      expect(breaksOf({ currentMinutes: 15 * 60, linkedTarget: resizingEnd })).toEqual([{ left: 300, width: 100 }]);
    });

    it("勤務を縮めて、休憩が勤務の外かお尻にかかる間は、その休憩を出さない", () => {
      expect(breaksOf({ currentMinutes: 13 * 60, linkedTarget: resizingEnd })).toEqual([]);
      expect(breaksOf({ currentMinutes: 11 * 60, linkedTarget: resizingEnd })).toEqual([]);
    });

    it("休憩の端をつまんで動かしている間は、その休憩を、動かしている途中の時刻で出す", () => {
      expect(
        breaksOf({
          breakResize: {
            from: { start: 12 * 60, end: 13 * 60 },
            to: { start: 12 * 60, end: 14 * 60 + 30 },
          },
        }),
      ).toEqual([{ left: 300, width: 250 }]);
    });
  });

  it("連結リサイズ中は境界を両側へ反映し、勤務ラベルを隠す", () => {
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

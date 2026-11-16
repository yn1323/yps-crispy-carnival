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

  describe("熟練度の印を置けるバー", () => {
    const work = (id: string, positionId: string, start: string, end: string) => ({
      id,
      positionId,
      positionName: positionId === "hall" ? "ホール" : "キッチン",
      color: "#000",
      start,
      end,
    });
    const shiftOf = (positions: ShiftData["positions"]): ShiftData => ({
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions,
    });
    const fits = (positions: ShiftData["positions"], hourWidth: number) =>
      buildShiftBarViewModel({ shift: shiftOf(positions), timeRange, hourWidth, isReadOnly: false })?.workBars.map(
        (bar) => [bar.key, bar.fitsSkillMark],
      );

    it("区間ごとに、印に使うポジションを持たせる", () => {
      const viewModel = buildShiftBarViewModel({
        shift: shiftOf([work("work-1", "hall", "09:00", "13:00"), work("work-2", "kitchen", "13:00", "17:00")]),
        timeRange,
        hourWidth: 100,
        isReadOnly: false,
      });

      expect(viewModel?.workBars.map((bar) => bar.workPosition)).toEqual([
        { positionId: "hall", positionName: "ホール" },
        { positionId: "kitchen", positionName: "キッチン" },
      ]);
    });

    it("勤務時刻のラベルの右に余白があるバーには置ける", () => {
      expect(fits([work("work-1", "hall", "09:00", "11:00")], 100)).toEqual([["work-1", true]]);
    });

    it("勤務時刻のラベルに重なる狭いバーには置かない", () => {
      // 1時間（100px）のバーは、ラベルが占める幅に印が重なる。
      expect(fits([work("work-1", "hall", "09:00", "10:00")], 100)).toEqual([["work-1", false]]);
    });

    it("最初の区間が狭く、ラベルが次の区間まで伸びる場合は、ラベルに重ならない区間にだけ置く", () => {
      expect(
        fits([work("work-1", "hall", "09:00", "09:30"), work("work-2", "kitchen", "09:30", "17:00")], 100),
      ).toEqual([
        ["work-1", false],
        ["work-2", true],
      ]);
    });

    it("印の幅より狭いバーには、ラベルから離れていても置かない", () => {
      // 30分が15pxになる幅では、2つ目の区間に印が収まらない。
      expect(fits([work("work-1", "hall", "09:00", "16:30"), work("work-2", "kitchen", "16:30", "17:00")], 30)).toEqual(
        [
          ["work-1", true],
          ["work-2", false],
        ],
      );
    });

    it("境界をドラッグしている間は置かない", () => {
      const viewModel = buildShiftBarViewModel({
        shift: shiftOf([work("work-1", "hall", "09:00", "12:00"), work("work-2", "kitchen", "12:00", "17:00")]),
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

      expect(viewModel?.workBars.map((bar) => bar.fitsSkillMark)).toEqual([false, false]);
    });
  });
});

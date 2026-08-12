import { describe, expect, it } from "vitest";
import type { ShiftData } from "@/src/domains/shift/types";
import {
  buildSPDailyCardViewModel,
  buildSPShiftTimeEditResult,
  getAssignedRange,
  getSPShiftEditState,
  timeToPercentage,
} from "./script";

describe("getSPShiftEditState", () => {
  it("休憩を除いた1件の勤務区間だけから初期時刻を作る", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        {
          id: "break-by-name",
          positionId: "legacy-break",
          positionName: "休憩",
          color: "#000",
          start: "09:00",
          end: "10:00",
        },
        {
          id: "work-1",
          positionId: "position-1",
          positionName: "ホール",
          color: "#123456",
          start: "10:00",
          end: "17:00",
        },
        {
          id: "break-by-id",
          positionId: "break",
          positionName: "中抜け",
          color: "#000",
          start: "17:00",
          end: "18:00",
        },
      ],
    };

    expect(getSPShiftEditState(shift)).toEqual({
      kind: "editable",
      initialStart: "10:00",
      initialEnd: "17:00",
    });
  });

  it("勤務区間が複数なら開始順の確認専用状態を返す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        {
          id: "work-2",
          positionId: "position-1",
          positionName: "ホール",
          color: "#123456",
          start: "14:00",
          end: "17:00",
        },
        {
          id: "work-1",
          positionId: "position-1",
          positionName: "ホール",
          color: "#123456",
          start: "10:00",
          end: "12:00",
        },
      ],
    };

    const result = getSPShiftEditState(shift);

    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.workPositions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
        { id: "work-1", start: "10:00", end: "12:00" },
        { id: "work-2", start: "14:00", end: "17:00" },
      ]);
    }
  });
});

describe("buildSPShiftTimeEditResult", () => {
  it("勤務がなければ店舗の実デフォルトポジションで新規作成する", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: { start: "10:00", end: "18:00" },
      requestedTimes: [{ start: "10:00", end: "18:00" }],
      positions: [
        {
          id: "break-only",
          positionId: "break",
          positionName: "休憩",
          color: "#000",
          start: "12:00",
          end: "13:00",
        },
      ],
    };
    const positions = [
      { id: "position-other", name: "キッチン", color: "#abcdef", isDefault: false },
      { id: "position-default", name: "ホール", color: "#123456", isDefault: true },
    ];

    const result = buildSPShiftTimeEditResult({
      shift,
      positions,
      startTime: "11:00",
      endTime: "17:00",
      segmentId: "new-segment",
    });

    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.shift).toEqual({
        ...shift,
        positions: [
          {
            id: "new-segment",
            positionId: "position-default",
            positionName: "ホール",
            color: "#123456",
            start: "11:00",
            end: "17:00",
          },
        ],
      });
    }
  });

  it("1件の勤務区間はIDとポジションと希望情報を保ったまま時刻だけ置換する", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: { start: "12:00", end: "14:00" },
      requestedTimes: [{ start: "12:00", end: "14:00" }],
      requestedShiftTypeOptionIds: ["legacy-request"],
      positions: [
        {
          id: "break-before",
          positionId: "break",
          positionName: "休憩",
          color: "#000",
          start: "11:00",
          end: "12:00",
        },
        {
          id: "work-1",
          positionId: "position-1",
          positionName: "ホール",
          color: "#123456",
          start: "12:00",
          end: "14:00",
        },
        {
          id: "break-after",
          positionId: "legacy-break",
          positionName: "休憩",
          color: "#000",
          start: "14:00",
          end: "15:00",
        },
      ],
    };
    const originalShift = structuredClone(shift);

    const result = buildSPShiftTimeEditResult({
      shift,
      positions: [],
      startTime: "12:00",
      endTime: "13:00",
      segmentId: "unused",
    });

    expect(result.kind).toBe("replaced");
    if (result.kind === "replaced") {
      expect(result.shift).toEqual({
        ...shift,
        positions: [
          {
            id: "work-1",
            positionId: "position-1",
            positionName: "ホール",
            color: "#123456",
            start: "12:00",
            end: "13:00",
          },
        ],
      });
    }
    expect(shift).toEqual(originalShift);
  });

  it("勤務区間が複数なら更新せず開始順の区間を返す", () => {
    const shift: ShiftData = {
      id: "shift-1",
      staffId: "staff-1",
      staffName: "田中",
      date: "2026-06-01",
      requestedTime: null,
      positions: [
        {
          id: "work-2",
          positionId: "position-1",
          positionName: "ホール",
          color: "#123456",
          start: "14:00",
          end: "17:00",
        },
        {
          id: "break",
          positionId: "break",
          positionName: "休憩",
          color: "#000",
          start: "12:00",
          end: "14:00",
        },
        {
          id: "work-1",
          positionId: "position-1",
          positionName: "ホール",
          color: "#123456",
          start: "10:00",
          end: "12:00",
        },
      ],
    };
    const originalShift = structuredClone(shift);

    const result = buildSPShiftTimeEditResult({
      shift,
      positions: [],
      startTime: "10:00",
      endTime: "17:00",
      segmentId: "unused",
    });

    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.workPositions.map(({ id, start, end }) => ({ id, start, end }))).toEqual([
        { id: "work-1", start: "10:00", end: "12:00" },
        { id: "work-2", start: "14:00", end: "17:00" },
      ]);
    }
    expect(shift).toEqual(originalShift);
  });
});

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

import { describe, expect, test } from "vitest";
import type { PeakBand, ShiftData } from "../types";
import { calculateDayStaffingStatus, getDayStatus } from "./staffingAlerts";

const makeShift = (staffId: string, positions: { start: string; end: string }[]): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: "2026-03-24",
  requestedTime: null,
  positions: positions.map((p, i) => ({
    id: `pos-${staffId}-${i}`,
    positionId: "pos1",
    positionName: "ホール",
    color: "#3b82f6",
    start: p.start,
    end: p.end,
  })),
});

describe("calculateDayStaffingStatus", () => {
  const peakBands: PeakBand[] = [
    { startTime: "11:00", endTime: "14:00", requiredCount: 3 },
    { startTime: "17:00", endTime: "21:00", requiredCount: 5 },
  ];

  test("ピーク帯が充足している場合", () => {
    const shifts = [
      makeShift("a", [{ start: "10:00", end: "15:00" }]),
      makeShift("b", [{ start: "10:00", end: "15:00" }]),
      makeShift("c", [{ start: "10:00", end: "15:00" }]),
      makeShift("d", [{ start: "16:00", end: "22:00" }]),
      makeShift("e", [{ start: "16:00", end: "22:00" }]),
      makeShift("f", [{ start: "16:00", end: "22:00" }]),
      makeShift("g", [{ start: "16:00", end: "22:00" }]),
      makeShift("h", [{ start: "16:00", end: "22:00" }]),
    ];
    const result = calculateDayStaffingStatus({ shifts, date: "2026-03-24", peakBands });
    expect(result.peakBandStatuses[0].isSatisfied).toBe(true);
    expect(result.peakBandStatuses[1].isSatisfied).toBe(true);
    expect(result.isFullySatisfied).toBe(true);
  });

  test("ランチ帯が不足している場合", () => {
    const shifts = [
      makeShift("a", [{ start: "10:00", end: "15:00" }]),
      makeShift("b", [{ start: "10:00", end: "15:00" }]),
    ];
    const result = calculateDayStaffingStatus({ shifts, date: "2026-03-24", peakBands });
    expect(result.peakBandStatuses[0].isSatisfied).toBe(false);
    expect(result.peakBandStatuses[0].shortfall).toBe(1);
    expect(result.isFullySatisfied).toBe(false);
  });

  test("ピーク帯未設定 → 全て none", () => {
    const result = calculateDayStaffingStatus({ shifts: [], date: "2026-03-24" });
    expect(result.peakBandStatuses).toHaveLength(0);
    expect(result.isFullySatisfied).toBe(true);
    expect(getDayStatus(result)).toBe("none");
  });

  test("最低人員が不足している場合", () => {
    const shifts = [makeShift("a", [{ start: "10:00", end: "18:00" }])];
    const result = calculateDayStaffingStatus({ shifts, date: "2026-03-24", minimumStaff: 2 });
    expect(result.minimumStaffStatus?.isSatisfied).toBe(false);
    expect(result.isFullySatisfied).toBe(false);
  });

  test("getDayStatus - 充足", () => {
    const shifts = [
      makeShift("a", [{ start: "10:00", end: "15:00" }]),
      makeShift("b", [{ start: "10:00", end: "15:00" }]),
      makeShift("c", [{ start: "10:00", end: "15:00" }]),
    ];
    const result = calculateDayStaffingStatus({
      shifts,
      date: "2026-03-24",
      peakBands: [{ startTime: "11:00", endTime: "14:00", requiredCount: 3 }],
    });
    expect(getDayStatus(result)).toBe("ok");
  });
});

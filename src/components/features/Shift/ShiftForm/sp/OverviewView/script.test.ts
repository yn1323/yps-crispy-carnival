import { describe, expect, it } from "vitest";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildOverviewViewModel } from "./script";

const staffs: StaffType[] = [
  { id: "late-staff", name: "遅番スタッフ", isSubmitted: true },
  { id: "early-staff", name: "早番スタッフ", isSubmitted: true },
];

const shifts: ShiftData[] = [
  {
    id: "late-shift",
    staffId: "late-staff",
    staffName: "遅番スタッフ",
    date: "2026-06-03",
    requestedTime: null,
    positions: [
      {
        id: "late-position",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "13:00",
        end: "17:00",
      },
    ],
  },
  {
    id: "early-shift",
    staffId: "early-staff",
    staffName: "早番スタッフ",
    date: "2026-06-03",
    requestedTime: null,
    positions: [
      {
        id: "early-position-2",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "13:00",
        end: "18:00",
      },
      {
        id: "early-position-1",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "09:00",
        end: "12:00",
      },
    ],
  },
];

describe("buildOverviewViewModel", () => {
  it("勤務範囲・出勤順・日付状態を描画用の週と行へ変換する", () => {
    const viewModel = buildOverviewViewModel({
      dates: ["2026-06-03", "2026-06-04"],
      holidays: ["2026-06-04"],
      staffs,
      shifts,
      warningCounts: new Map([["2026-06-03", 3]]),
      isReadOnly: false,
    });

    expect(viewModel.weeks[0].label).toBe("6/1 – 6/7");
    expect(viewModel.weeks[0].rows).toHaveLength(7);
    expect(viewModel.weeks[0].rows[0]).toMatchObject({
      iso: "2026-06-01",
      statusLabel: "期間外",
      statusTone: "outOfRange",
      surfaceTone: "muted",
      canOpenDaily: false,
    });
    expect(viewModel.weeks[0].rows[2]).toMatchObject({
      iso: "2026-06-03",
      warningCount: 3,
      statusLabel: null,
      canOpenDaily: true,
    });
    expect(viewModel.weeks[0].rows[2].staffRows).toEqual([
      { key: "early-staff", name: "早番スタッフ", assignedTimeLabel: "09:00–18:00" },
      { key: "late-staff", name: "遅番スタッフ", assignedTimeLabel: "13:00–17:00" },
    ]);
    expect(viewModel.weeks[0].rows[3]).toMatchObject({
      iso: "2026-06-04",
      closedLabel: "定休日",
      statusLabel: "定休日",
      statusTone: "closed",
      canOpenDaily: true,
      staffRows: [],
    });
  });

  it("読み取り専用では期間内の日付も日別へ移動できない", () => {
    const viewModel = buildOverviewViewModel({
      dates: ["2026-06-01"],
      holidays: [],
      staffs: [],
      shifts: [],
      warningCounts: new Map(),
      isReadOnly: true,
    });

    expect(viewModel.weeks[0].rows[0].canOpenDaily).toBe(false);
  });
});

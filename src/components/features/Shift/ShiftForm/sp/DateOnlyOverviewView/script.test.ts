import { describe, expect, it } from "vitest";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildDateOnlyOverviewViewModel } from "./script";

const staffs: StaffType[] = [
  { id: "staff-1", name: "田中", isSubmitted: true },
  { id: "staff-2", name: "佐藤", isSubmitted: true },
];

const shifts: ShiftData[] = [
  {
    id: "shift-1",
    staffId: "staff-1",
    staffName: "田中",
    date: "2026-06-03",
    requestedTime: null,
    positions: [
      {
        id: "position-1",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "09:00",
        end: "18:00",
      },
    ],
  },
];

describe("buildDateOnlyOverviewViewModel", () => {
  it("週の日付状態・割当スタッフ・確認事項を描画用の行へ変換する", () => {
    const viewModel = buildDateOnlyOverviewViewModel({
      dates: ["2026-06-03", "2026-06-04"],
      holidays: ["2026-06-04"],
      staffs,
      shifts,
      warningCounts: new Map([["2026-06-03", 2]]),
      isReadOnly: false,
    });

    expect(viewModel.weeks).toHaveLength(1);
    expect(viewModel.weeks[0].label).toBe("6/1 – 6/7");
    expect(viewModel.weeks[0].rows).toHaveLength(7);
    expect(viewModel.weeks[0].rows[0]).toMatchObject({
      iso: "2026-06-01",
      dateTone: "muted",
      weekdayTone: "muted",
      statusLabel: "期間外",
      statusAriaLabel: "6/1(月) 期間外",
      canOpenDaily: false,
    });
    expect(viewModel.weeks[0].rows[2]).toMatchObject({
      iso: "2026-06-03",
      weekdayTone: "weekday",
      warningCount: 2,
      statusLabel: null,
      canOpenDaily: true,
      actionAriaLabel: "6/3(水)の日別を表示",
    });
    expect(viewModel.weeks[0].rows[2].staffRows).toEqual([{ key: "staff-1", name: "田中" }]);
    expect(viewModel.weeks[0].rows[3]).toMatchObject({
      iso: "2026-06-04",
      statusLabel: "定休日",
      canOpenDaily: false,
      staffRows: [],
    });
  });

  it("読み取り専用では期間内の営業日も日別へ移動できない", () => {
    const viewModel = buildDateOnlyOverviewViewModel({
      dates: ["2026-06-01"],
      holidays: [],
      staffs: [],
      shifts: [],
      warningCounts: new Map(),
      isReadOnly: true,
    });

    expect(viewModel.weeks[0].rows[0]).toMatchObject({
      iso: "2026-06-01",
      canOpenDaily: false,
      actionAriaLabel: undefined,
      statusLabel: "勤務なし",
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildShiftTypeOverviewViewModel } from "./script";

const submissionPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "late", name: "遅番", startTime: "13:00", endTime: "18:00", sortOrder: 2 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 1 },
  ],
};

const staffs: StaffType[] = [
  { id: "staff-submitted", name: "田中", isSubmitted: true },
  { id: "staff-unsubmitted", name: "佐藤", isSubmitted: false },
];

const shifts: ShiftData[] = [
  {
    id: "shift-submitted",
    staffId: "staff-submitted",
    staffName: "田中",
    date: "2026-06-01",
    requestedTime: null,
    positions: [
      {
        id: "position-late",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "13:00",
        end: "18:00",
        shiftTypeOptionId: "late",
      },
      {
        id: "position-early",
        positionId: "default",
        positionName: "勤務",
        color: "#000",
        start: "09:00",
        end: "13:00",
        shiftTypeOptionId: "early",
      },
    ],
  },
];

describe("buildShiftTypeOverviewViewModel", () => {
  it("週・日付・スタッフ行を描画順のセルとバッジへ変換する", () => {
    const viewModel = buildShiftTypeOverviewViewModel({
      dates: ["2026-06-01", "2026-06-02"],
      weekStart: "mon",
      holidays: ["2026-06-02"],
      isReadOnly: false,
      staffs,
      shifts,
      submissionPattern,
      warningCounts: new Map([["2026-06-01", 2]]),
    });

    expect(viewModel.weeks).toHaveLength(1);
    const week = viewModel.weeks[0];
    expect(week.rangeLabel).toBe("6/1 – 6/7");
    expect(
      week.dates
        .slice(0, 3)
        .map(({ iso, label, weekdayLabel, isClickable, isClosed, warningCount, rangeStatusLabel }) => ({
          iso,
          label,
          weekdayLabel,
          isClickable,
          isClosed,
          warningCount,
          rangeStatusLabel,
        })),
    ).toEqual([
      {
        iso: "2026-06-01",
        label: "6/1",
        weekdayLabel: "月",
        isClickable: true,
        isClosed: false,
        warningCount: 2,
        rangeStatusLabel: null,
      },
      {
        iso: "2026-06-02",
        label: "6/2",
        weekdayLabel: "火",
        isClickable: true,
        isClosed: true,
        warningCount: 0,
        rangeStatusLabel: null,
      },
      {
        iso: "2026-06-03",
        label: "6/3",
        weekdayLabel: "水",
        isClickable: false,
        isClosed: false,
        warningCount: 0,
        rangeStatusLabel: "期間外",
      },
    ]);

    expect(week.rows.map(({ key }) => key)).toEqual(["staff-submitted", "staff-unsubmitted"]);
    expect(week.rows[0].cells[0].content).toEqual({
      kind: "assignments",
      badges: [
        { key: "early", label: "早番", bg: "#f0fdfa", color: "#0f766e" },
        { key: "late", label: "遅番", bg: "#eff6ff", color: "#2563eb" },
      ],
    });
    expect(week.rows[0].cells[1].content).toEqual({ kind: "closed", label: "定休日" });
    expect(week.rows[0].cells[2].content).toEqual({ kind: "status", label: "—", tone: "outOfRange" });
    expect(week.rows[1].cells[0].content).toEqual({ kind: "status", label: "未提出", tone: "unsubmitted" });
    expect(week.rows[1].cells[2].content).toEqual({ kind: "status", label: "未提出", tone: "unsubmitted" });
  });

  it("読み取り専用では期間内の日付も選択不可にする", () => {
    const viewModel = buildShiftTypeOverviewViewModel({
      dates: ["2026-06-01"],
      weekStart: "sun",
      holidays: [],
      isReadOnly: true,
      staffs: [],
      shifts: [],
      submissionPattern,
      warningCounts: new Map(),
    });

    expect(viewModel.weeks[0].dates.map(({ iso }) => iso)).toEqual([
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
    ]);
    expect(viewModel.weeks[0].dates.find(({ iso }) => iso === "2026-06-01")?.isClickable).toBe(false);
  });
});

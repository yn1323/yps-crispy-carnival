import { describe, expect, it } from "vitest";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildOverviewWeeks } from "./script";

describe("buildOverviewWeeks", () => {
  it("週、勤務時間、定休日、合計を描画用の行へ変換する", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: false };
    const shifts: ShiftData[] = [
      {
        id: "shift-1",
        staffId: staff.id,
        staffName: staff.name,
        date: "2026-06-01",
        requestedTime: null,
        positions: [
          {
            id: "position-1",
            positionId: "default",
            positionName: "勤務",
            color: "#000",
            start: "09:00",
            end: "17:00",
          },
        ],
      },
    ];

    const [week] = buildOverviewWeeks({
      dates: ["2026-06-01", "2026-06-02"],
      weekStart: "mon",
      holidays: ["2026-06-02"],
      isReadOnly: false,
      staffs: [staff],
      shifts,
      warningCounts: new Map([["2026-06-01", 2]]),
    });

    expect(week.rangeLabel).toBe("6/1 – 6/7");
    expect(week.dates[0]).toMatchObject({ iso: "2026-06-01", isClickable: true, warningCount: 2 });
    expect(week.rows[0]).toMatchObject({
      name: "田中",
      isUnsubmitted: true,
      totalLabel: "8h",
      hasTotal: true,
    });
    expect(week.rows[0].cells.slice(0, 2)).toMatchObject([
      { text: "09:00–17:00", tone: "assigned" },
      { text: "定休日", tone: "closed" },
    ]);
  });
});

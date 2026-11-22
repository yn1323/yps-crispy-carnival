import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftData, StaffSortMode, StaffType } from "@/src/domains/shift/types";
import { buildShiftTypeOverviewViewModel } from "./script";

const submissionPattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "late", name: "遅番", startTime: "13:00", endTime: "18:00", sortOrder: 2 },
    { id: "early", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 1 },
  ],
};

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
        end: "18:00",
        shiftTypeOptionId: "late",
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
        id: "early-position",
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
  it("勤務パターン順・日付状態を描画用の週と行へ変換し、並び替えを渡さない場合は既定の並び順で出す", () => {
    const viewModel = buildShiftTypeOverviewViewModel({
      dates: ["2026-06-03", "2026-06-04"],
      holidays: ["2026-06-04"],
      staffs,
      shifts,
      submissionPattern,
      warningCounts: new Map([["2026-06-03", 1]]),
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
      warningCount: 1,
      statusLabel: null,
      canOpenDaily: true,
    });
    expect(viewModel.weeks[0].rows[2].staffRows).toEqual([
      {
        key: "early-staff",
        name: "早番スタッフ",
        optionChips: [{ key: "early", label: "早番", colorIndex: 0, segment: shifts[1].positions[0] }],
        staff: staffs[1],
        shift: shifts[1],
      },
      {
        key: "late-staff",
        name: "遅番スタッフ",
        optionChips: [{ key: "late", label: "遅番", colorIndex: 1, segment: shifts[0].positions[0] }],
        staff: staffs[0],
        shift: shifts[0],
      },
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

  describe("その日のスタッフの並び", () => {
    // スタッフのページで決めた並び順は遅番スタッフが先で、勤務は早番スタッフのほうが早い。
    const orderedStaffs: StaffType[] = [
      { ...staffs[0], displayOrder: 0 },
      { ...staffs[1], displayOrder: 1 },
    ];
    const staffKeys = (staffSortMode?: StaffSortMode) =>
      buildShiftTypeOverviewViewModel({
        dates: ["2026-06-03"],
        holidays: [],
        staffs: orderedStaffs,
        shifts,
        submissionPattern,
        warningCounts: new Map(),
        isReadOnly: false,
        staffSortMode,
      }).weeks[0].rows[2].staffRows.map((row) => row.key);

    it("「固定」と、並び替えを渡さない場合は、勤務の時刻にかかわらず、決めた並び順で出す", () => {
      expect(staffKeys("fixed")).toEqual(["late-staff", "early-staff"]);
      expect(staffKeys()).toEqual(["late-staff", "early-staff"]);
    });

    it("「勤務時間順」では、日別と同じく、勤務の早い順に出す", () => {
      expect(staffKeys("workTime")).toEqual(["early-staff", "late-staff"]);
    });
  });

  it("読み取り専用では期間内の日付も日別へ移動できない", () => {
    const viewModel = buildShiftTypeOverviewViewModel({
      dates: ["2026-06-01"],
      holidays: [],
      staffs: [],
      shifts: [],
      submissionPattern,
      warningCounts: new Map(),
      isReadOnly: true,
    });

    expect(viewModel.weeks[0].rows[0].canOpenDaily).toBe(false);
  });
});

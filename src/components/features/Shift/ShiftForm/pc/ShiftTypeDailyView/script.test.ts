import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { buildStaffingCountView, type DayStaffingView, type StaffingSlotView } from "../../staffingPresentation";
import { buildShiftTypeDailyViewModel, indexStaffingSlotsByOptionKey, summarizeStaffingSlot } from "./script";

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
    requestedTime: { start: "09:00", end: "13:00" },
    requestedShiftTypeOptionIds: ["early"],
    positions: [
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

describe("buildShiftTypeDailyViewModel", () => {
  it("勤務パターンを並べ替え、件数・希望・割当を描画値へまとめる", () => {
    const viewModel = buildShiftTypeDailyViewModel({
      submissionPattern,
      shifts,
      staffs,
      selectedDate: "2026-06-01",
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map([["staff-submitted", ["必要人数を下回っています"]]]),
    });

    expect(viewModel.optionColumns.map(({ key, timeLabel, countLabel }) => ({ key, timeLabel, countLabel }))).toEqual([
      { key: "early", timeLabel: "09:00〜13:00", countLabel: "1人" },
      { key: "late", timeLabel: "13:00〜18:00", countLabel: "0人" },
    ]);
    expect(Object.keys(viewModel.optionColumns[0]).sort()).toEqual(["color", "countLabel", "key", "name", "timeLabel"]);
    expect(viewModel.minimumTableWidth).toBe(670);
    expect(viewModel.columnWidths).toEqual({ staff: 220, request: 150, note: null, option: 150 });
    expect(viewModel.rows.map(({ key }) => key)).toEqual(["staff-submitted", "staff-unsubmitted"]);
    expect(viewModel.rows[0].warningMessages).toEqual(["必要人数を下回っています"]);
    expect(viewModel.rows[0].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "early", label: "早番" },
    ]);
    expect(
      viewModel.rows[0].cells.map(({ key, assigned, ariaLabel, symbol }) => ({ key, assigned, ariaLabel, symbol })),
    ).toEqual([
      { key: "early", assigned: true, ariaLabel: "田中 早番 勤務あり", symbol: "○" },
      { key: "late", assigned: false, ariaLabel: "田中 遅番 勤務なし", symbol: "×" },
    ]);
    expect(viewModel.rows[0].staff).toBe(staffs[0]);
    expect(viewModel.rows[0].cells[0].option).toBe(submissionPattern.options[1]);
  });

  it("提出状態・確定表示・定休日を表示状態へ変換する", () => {
    const viewModel = buildShiftTypeDailyViewModel({
      submissionPattern,
      shifts: [],
      staffs,
      selectedDate: "2026-06-01",
      holidays: ["2026-06-01"],
      isConfirmedDisplay: true,
      warningMessagesByStaffId: new Map(),
    });

    expect(viewModel.isShopClosedDate).toBe(true);
    expect(viewModel.requestHeaderLabel).toBe("確定");
    expect(viewModel.rows[0].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "rest", label: "休み" },
    ]);
    expect(viewModel.rows[1].isStaffNameMuted).toBe(true);
    expect(viewModel.rows[1].requestBadges.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "unsubmitted", label: "未提出" },
    ]);
  });

  it("設定から削除された希望パターンは従来の代替表示を使う", () => {
    const viewModel = buildShiftTypeDailyViewModel({
      submissionPattern,
      shifts: [
        {
          ...shifts[0],
          requestedShiftTypeOptionIds: ["removed-option"],
          positions: [],
        },
      ],
      staffs: [staffs[0]],
      selectedDate: "2026-06-01",
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map(),
    });

    expect(viewModel.rows[0].requestBadges).toEqual([
      {
        key: "removed-option",
        label: "勤務パターン",
        bg: "gray.100",
        color: "gray.700",
      },
    ]);
  });

  it("メモがある募集では希望列の右にメモ列を足し、表の最小幅も広げる", () => {
    const base = {
      submissionPattern,
      shifts: [],
      staffs,
      selectedDate: "2026-06-01",
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map(),
    };
    const withoutNotes = buildShiftTypeDailyViewModel(base);
    const withNotes = buildShiftTypeDailyViewModel({ ...base, hasDateNotes: true });

    expect(withoutNotes.requestHeaderLabel).toBe("希望");
    expect(withNotes.requestHeaderLabel).toBe("希望");
    expect(withNotes.columnWidths.request).toBe(150);
    expect(withNotes.columnWidths.note).toBe(200);
    expect(withNotes.minimumTableWidth - withoutNotes.minimumTableWidth).toBe(200);
  });

  describe("くわしく表示", () => {
    const hallEarly = { ...shifts[0].positions[0], positionId: "hall", positionName: "ホール", color: "#2563eb" };
    const kitchenLate = {
      id: "position-late",
      positionId: "kitchen",
      positionName: "キッチン",
      color: "#ea580c",
      start: "13:00",
      end: "18:00",
      shiftTypeOptionId: "late",
    };
    const detailShift: ShiftData = {
      ...shifts[0],
      positions: [hallEarly, kitchenLate],
      // 早番の時間内にだけ休憩がある。
      breaks: [{ start: "11:00", end: "11:30" }],
      isProvisional: true,
    };
    const base = {
      submissionPattern,
      shifts: [detailShift],
      staffs: [staffs[0]],
      selectedDate: "2026-06-01",
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map<string, string[]>(),
    };

    it("勤務パターンごとの勤務と、その時間内の休憩をセルへ持たせる", () => {
      const [row] = buildShiftTypeDailyViewModel({ ...base, detailMode: true, usesPositionColors: true }).rows;

      expect(row.shift).toBe(detailShift);
      expect(
        row.cells.map(({ key, segment, breakShift, isProvisional }) => ({
          key,
          position: segment?.positionName,
          breakPositions: breakShift?.positions.map((position) => position.id),
          isProvisional,
        })),
      ).toEqual([
        { key: "early", position: "ホール", breakPositions: ["position-early"], isProvisional: true },
        { key: "late", position: "キッチン", breakPositions: undefined, isProvisional: true },
      ]);
    });

    it("セルの読み上げにポジションと休憩を足す", () => {
      const labels = (options: { detailMode: boolean; usesPositionColors: boolean }) =>
        buildShiftTypeDailyViewModel({ ...base, ...options }).rows[0].cells.map((cell) => cell.ariaLabel);

      expect(labels({ detailMode: true, usesPositionColors: true })).toEqual([
        "田中 早番 勤務あり、ホール、休憩あり",
        "田中 遅番 勤務あり、キッチン",
      ]);
      // ポジションが1つだけの店舗では、ポジションを読み上げない。
      expect(labels({ detailMode: true, usesPositionColors: false })).toEqual([
        "田中 早番 勤務あり、休憩あり",
        "田中 遅番 勤務あり",
      ]);
    });

    it("シンプル表示では読み上げを変えない", () => {
      const cells = buildShiftTypeDailyViewModel(base).rows[0].cells;

      expect(cells.map((cell) => cell.ariaLabel)).toEqual(["田中 早番 勤務あり", "田中 遅番 勤務あり"]);
    });

    it("勤務のないセルは、仮の勤務の日でも仮として扱わない", () => {
      const [row] = buildShiftTypeDailyViewModel({
        ...base,
        shifts: [{ ...detailShift, positions: [hallEarly] }],
        detailMode: true,
        usesPositionColors: true,
      }).rows;

      expect(row.cells.map(({ key, isProvisional, ariaLabel }) => ({ key, isProvisional, ariaLabel }))).toEqual([
        { key: "early", isProvisional: true, ariaLabel: "田中 早番 勤務あり、ホール、休憩あり" },
        { key: "late", isProvisional: false, ariaLabel: "田中 遅番 勤務なし" },
      ]);
    });
  });
});

const position = (name: string, count: number, required: number | null, isNewcomerOnly = false) => ({
  positionId: name,
  name,
  color: "#000",
  ...buildStaffingCountView({ count, required, isNewcomerOnly }),
});

const slot = (overrides: Partial<StaffingSlotView>): StaffingSlotView => ({
  id: "shiftType:early",
  label: "早番",
  total: 0,
  positions: [],
  hasShortage: false,
  hasExcess: false,
  ...overrides,
});

describe("summarizeStaffingSlot", () => {
  it("必要人数はポジションごとの設定を足し、内訳をポジション名と過不足つきで説明する", () => {
    expect(
      summarizeStaffingSlot(
        slot({ total: 3, positions: [position("ホール", 2, 3), position("キッチン", 1, 1)], hasShortage: true }),
      ),
    ).toEqual({ totalLabel: "3/4", title: "早番 ホール 2/3 ▲1、キッチン 1/1" });
  });

  it("多い人数と、見習いだけのポジションを内訳で説明する", () => {
    expect(
      summarizeStaffingSlot(
        slot({ total: 3, positions: [position("ホール", 2, 1, true), position("キッチン", 1, 1)], hasExcess: true }),
      ),
    ).toEqual({ totalLabel: "3/2", title: "早番 ホール 2/1 ＋1（見習いだけ）、キッチン 1/1" });
  });

  it("必要人数を設定していないポジションは、必要の合計に含めない", () => {
    expect(
      summarizeStaffingSlot(slot({ total: 3, positions: [position("ホール", 2, 2), position("キッチン", 1, null)] })),
    ).toEqual({ totalLabel: "3/2", title: "早番 ホール 2/2、キッチン 1" });
  });

  it("必要人数が1つもない区切りは、人数だけを出す", () => {
    expect(
      summarizeStaffingSlot(
        slot({ total: 2, positions: [position("ホール", 2, null), position("キッチン", 0, null)] }),
      ),
    ).toEqual({ totalLabel: "2", title: "早番 ホール 2、キッチン 0" });
  });

  it("必要人数が0人の設定は、設定ありとして「/0」を出す", () => {
    expect(summarizeStaffingSlot(slot({ total: 1, positions: [position("ホール", 1, 0)] })).totalLabel).toBe("1/0");
  });
});

describe("indexStaffingSlotsByOptionKey", () => {
  it("勤務パターンの区切りだけを、勤務パターンのIDで引けるようにする", () => {
    const early = slot({ id: "shiftType:early" });
    const late = slot({ id: "shiftType:late", label: "遅番" });
    const view: DayStaffingView = {
      date: "2026-06-03",
      template: { label: "未設定", templateId: null, templateName: null, isCustom: false, isDateSpecific: false },
      hasRequirements: false,
      slots: [early, late, slot({ id: "allDay", label: "1日" })],
      bands: [],
      hasShortage: false,
      hasExcess: false,
      shortageCount: 0,
    };

    expect([...indexStaffingSlotsByOptionKey(view)]).toEqual([
      ["early", early],
      ["late", late],
    ]);
  });
});

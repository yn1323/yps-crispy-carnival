import { Provider } from "jotai";
import type { ReactNode } from "react";
import { useShiftFormInit } from "../hooks/useShiftFormInit";
import type { PositionType, RequiredStaffingData, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "../types";

export const mockStaffs: StaffType[] = [
  { id: "staff1", name: "Aさん", isSubmitted: true },
  { id: "staff2", name: "Bさん", isSubmitted: true },
  { id: "staff3", name: "Cさん", isSubmitted: false },
  { id: "staff4", name: "Dさん", isSubmitted: true },
  { id: "staff5", name: "Eさん", isSubmitted: false },
];

export const mockPositions: PositionType[] = [
  { id: "default", name: "シフト", color: "#3b82f6" },
  { id: "break", name: "休憩", color: "#6b7280" },
];

export const mockDates = [
  "2026-01-21",
  "2026-01-22",
  "2026-01-23",
  "2026-01-24",
  "2026-01-25",
  "2026-01-26",
  "2026-01-27",
];

// 水曜開始 2 週間（月曜起算で先頭 月火 / 末尾 火〜日 が期間外）
export const mockDatesMidWeekStart = [
  "2026-01-21",
  "2026-01-22",
  "2026-01-23",
  "2026-01-24",
  "2026-01-25",
  "2026-01-26",
  "2026-01-27",
  "2026-01-28",
  "2026-01-29",
  "2026-01-30",
  "2026-01-31",
  "2026-02-01",
  "2026-02-02",
  "2026-02-03",
];

export const mockTimeRange: TimeRange = { start: 9, end: 22, unit: 30 };

export const mockHolidays = ["2026-02-11"];

// 単純な「勤務」セグメント
const workSeg = (staffId: string, date: string, start: string, end: string, suffix = "") => ({
  id: `seg-${staffId}-${date}-${start}-${end}${suffix}`,
  positionId: "default",
  positionName: "シフト",
  color: "#3b82f6",
  start,
  end,
});

// 「休憩」セグメント（斜線表示用）
const breakSeg = (staffId: string, date: string, start: string, end: string) => ({
  id: `brk-${staffId}-${date}-${start}-${end}`,
  positionId: "break",
  positionName: "休憩",
  color: "#6b7280",
  start,
  end,
});

// ==========================================
// 通常想定パターン（2026-01-21）
// ==========================================
const baseDate = "2026-01-21";

export const mockShifts: ShiftData[] = [
  // A: 希望 + 一致するシフト
  {
    id: `shift-staff1-${baseDate}`,
    staffId: "staff1",
    staffName: "Aさん",
    date: baseDate,
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [workSeg("staff1", baseDate, "10:00", "18:00")],
  },
  // B: 希望 + 不一致（希望より短いシフト）
  {
    id: `shift-staff2-${baseDate}`,
    staffId: "staff2",
    staffName: "Bさん",
    date: baseDate,
    requestedTime: { start: "12:00", end: "20:00" },
    positions: [workSeg("staff2", baseDate, "13:00", "18:00")],
  },
  // C（未提出）: 希望なし + 手動追加したシフト
  {
    id: `shift-staff3-${baseDate}`,
    staffId: "staff3",
    staffName: "Cさん",
    date: baseDate,
    requestedTime: null,
    positions: [workSeg("staff3", baseDate, "10:00", "14:00")],
  },
  // D: 希望あり + 休憩を挟むシフト
  {
    id: `shift-staff4-${baseDate}`,
    staffId: "staff4",
    staffName: "Dさん",
    date: baseDate,
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      workSeg("staff4", baseDate, "09:00", "12:00"),
      breakSeg("staff4", baseDate, "12:00", "13:00"),
      workSeg("staff4", baseDate, "13:00", "17:00"),
    ],
  },
  // E（未提出）: 希望もシフトもなし
  // -> レコード自体がない
];

// ==========================================
// 1/22 : 希望のみ（シフト未割当）ケースの塊
// ==========================================
const reqOnlyDate = "2026-01-22";

export const mockShiftsRequestOnly: ShiftData[] = [
  {
    id: `shift-staff1-${reqOnlyDate}`,
    staffId: "staff1",
    staffName: "Aさん",
    date: reqOnlyDate,
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [],
  },
  {
    id: `shift-staff2-${reqOnlyDate}`,
    staffId: "staff2",
    staffName: "Bさん",
    date: reqOnlyDate,
    requestedTime: { start: "12:00", end: "20:00" },
    positions: [],
  },
  {
    id: `shift-staff4-${reqOnlyDate}`,
    staffId: "staff4",
    staffName: "Dさん",
    date: reqOnlyDate,
    requestedTime: { start: "15:00", end: "21:00" },
    positions: [],
  },
];

// ==========================================
// 1/23: 全パターン網羅
// ==========================================
const allPatternsDate = "2026-01-23";

export const mockShiftsAllPatterns: ShiftData[] = [
  // A: 希望 + 一致シフト
  {
    id: `ap-staff1`,
    staffId: "staff1",
    staffName: "Aさん",
    date: allPatternsDate,
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [workSeg("staff1", allPatternsDate, "10:00", "18:00", "-ap")],
  },
  // B: 希望のみ（未割当）
  {
    id: `ap-staff2`,
    staffId: "staff2",
    staffName: "Bさん",
    date: allPatternsDate,
    requestedTime: { start: "11:00", end: "19:00" },
    positions: [],
  },
  // C（未提出）: 手動シフト追加
  {
    id: `ap-staff3`,
    staffId: "staff3",
    staffName: "Cさん",
    date: allPatternsDate,
    requestedTime: null,
    positions: [workSeg("staff3", allPatternsDate, "13:00", "17:00", "-ap")],
  },
  // D: 休憩を挟むシフト
  {
    id: `ap-staff4`,
    staffId: "staff4",
    staffName: "Dさん",
    date: allPatternsDate,
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      workSeg("staff4", allPatternsDate, "09:00", "12:00", "-ap"),
      breakSeg("staff4", allPatternsDate, "12:00", "13:00"),
      workSeg("staff4", allPatternsDate, "13:00", "17:00", "-ap"),
    ],
  },
  // E（未提出）: レコードなし
];

// 1/21 + 1/22 + 1/23 を合算した総合セット
export const mockShiftsVariety: ShiftData[] = [...mockShifts, ...mockShiftsRequestOnly, ...mockShiftsAllPatterns];

export const mockRequiredStaffing: RequiredStaffingData[] = [
  {
    dayOfWeek: 3,
    slots: [
      { hour: 10, position: "シフト", requiredCount: 3 },
      { hour: 14, position: "シフト", requiredCount: 5 },
    ],
  },
  {
    dayOfWeek: 4,
    slots: [{ hour: 9, position: "シフト", requiredCount: 3 }],
  },
];

type JotaiStoryWrapperProps = {
  children: ReactNode;
  overrides?: {
    shopId?: string;
    staffs?: StaffType[];
    positions?: PositionType[];
    initialShifts?: ShiftData[];
    dates?: string[];
    timeRange?: TimeRange;
    holidays?: string[];
    isReadOnly?: boolean;
    currentStaffId?: string;
    allShifts?: ShiftData[];
    requiredStaffing?: RequiredStaffingData[];
    initialViewMode?: ViewMode;
    initialSortMode?: SortMode;
  };
};

function JotaiInitializer({
  children,
  overrides,
}: {
  children: ReactNode;
  overrides: JotaiStoryWrapperProps["overrides"];
}): ReactNode {
  useShiftFormInit({
    shopId: overrides?.shopId ?? "shop1",
    staffs: overrides?.staffs ?? mockStaffs,
    positions: overrides?.positions ?? mockPositions,
    initialShifts: overrides?.initialShifts ?? mockShifts,
    dates: overrides?.dates ?? mockDates,
    timeRange: overrides?.timeRange ?? mockTimeRange,
    holidays: overrides?.holidays ?? [],
    isReadOnly: overrides?.isReadOnly,
    currentStaffId: overrides?.currentStaffId,
    allShifts: overrides?.allShifts,
    requiredStaffing: overrides?.requiredStaffing,
    initialViewMode: overrides?.initialViewMode,
    initialSortMode: overrides?.initialSortMode,
  });
  return children;
}

export function JotaiStoryWrapper({ children, overrides }: JotaiStoryWrapperProps): ReactNode {
  return (
    <Provider>
      <JotaiInitializer overrides={overrides}>{children}</JotaiInitializer>
    </Provider>
  );
}

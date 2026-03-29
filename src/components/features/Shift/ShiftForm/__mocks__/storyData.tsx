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
  { id: "pos1", name: "ホール", color: "#3b82f6" },
  { id: "pos2", name: "キッチン", color: "#f97316" },
  { id: "pos3", name: "レジ", color: "#10b981" },
  { id: "pos4", name: "休憩", color: "#6b7280" },
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

export const mockTimeRange: TimeRange = { start: 9, end: 22, unit: 30 };

export const mockHolidays = ["2026-02-11"];

export const mockShifts: ShiftData[] = [
  {
    id: "shift1",
    staffId: "staff1",
    staffName: "Aさん",
    date: "2026-01-21",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "14:00" },
      { id: "seg2", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "14:00", end: "18:00" },
    ],
  },
  {
    id: "shift2",
    staffId: "staff2",
    staffName: "Bさん",
    date: "2026-01-21",
    requestedTime: { start: "12:00", end: "20:00" },
    positions: [
      { id: "seg3", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "12:00", end: "16:00" },
      { id: "seg4", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "16:00", end: "20:00" },
    ],
  },
  {
    id: "shift3",
    staffId: "staff4",
    staffName: "Dさん",
    date: "2026-01-21",
    requestedTime: { start: "15:00", end: "21:00" },
    positions: [
      { id: "seg5", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "15:00", end: "21:00" },
    ],
  },
  {
    id: "shift4",
    staffId: "staff1",
    staffName: "Aさん",
    date: "2026-01-22",
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg6", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "12:00" },
      { id: "seg7", positionId: "pos4", positionName: "休憩", color: "#6b7280", start: "12:00", end: "13:00" },
      { id: "seg8", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "13:00", end: "17:00" },
    ],
  },
  {
    id: "shift5",
    staffId: "staff2",
    staffName: "Bさん",
    date: "2026-01-22",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg9", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "10:00", end: "18:00" },
    ],
  },
  {
    id: "shift6",
    staffId: "staff3",
    staffName: "Cさん",
    date: "2026-01-21",
    requestedTime: null,
    positions: [
      { id: "seg10", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "10:00", end: "14:00" },
    ],
  },
];

export const mockRequiredStaffing: RequiredStaffingData[] = [
  {
    dayOfWeek: 3,
    slots: [
      { hour: 10, position: "ホール", requiredCount: 2 },
      { hour: 10, position: "キッチン", requiredCount: 1 },
      { hour: 14, position: "ホール", requiredCount: 3 },
      { hour: 14, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 4,
    slots: [
      { hour: 9, position: "ホール", requiredCount: 2 },
      { hour: 9, position: "キッチン", requiredCount: 1 },
    ],
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

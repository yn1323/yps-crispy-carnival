import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from ".";
import type { RequiredStaffingData } from "./types";

const meta = {
  title: "Features/Shift/ShiftForm",
  component: ShiftForm,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// モックデータ: スタッフ
const mockStaffs = [
  { id: "staff1", name: "Aさん", isSubmitted: true },
  { id: "staff2", name: "Bさん", isSubmitted: true },
  { id: "staff3", name: "Cさん", isSubmitted: false },
  { id: "staff4", name: "Dさん", isSubmitted: true },
  { id: "staff5", name: "Eさん", isSubmitted: false },
];

// モックデータ: ポジション
const mockPositions = [
  { id: "pos1", name: "ホール", color: "#3b82f6" },
  { id: "pos2", name: "キッチン", color: "#f97316" },
  { id: "pos3", name: "レジ", color: "#10b981" },
  { id: "pos4", name: "休憩", color: "#6b7280" },
];

// モックデータ: 日付（1週間分）
const mockDates = ["2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25", "2026-01-26", "2026-01-27"];

// モックデータ: シフト
const mockShifts = [
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

// 祝日
const mockHolidays = ["2026-02-11"];

// 必要人員設定
const mockRequiredStaffing: RequiredStaffingData[] = [
  {
    dayOfWeek: 3, // 水（2026-01-21）
    slots: [
      { hour: 10, position: "ホール", requiredCount: 2 },
      { hour: 10, position: "キッチン", requiredCount: 1 },
      { hour: 14, position: "ホール", requiredCount: 3 },
      { hour: 14, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 4, // 木（2026-01-22）
    slots: [
      { hour: 9, position: "ホール", requiredCount: 2 },
      { hour: 9, position: "キッチン", requiredCount: 1 },
    ],
  },
];

export const Basic: Story = {
  args: {
    shopId: "shop1",
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
    holidays: [],
  },
};

export const WithRequiredStaffing: Story = {
  args: {
    shopId: "shop1",
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
    holidays: mockHolidays,
    requiredStaffing: mockRequiredStaffing,
  },
};

export const ReadOnly: Story = {
  args: {
    ...Basic.args,
    isReadOnly: true,
    currentStaffId: "staff1",
  },
};

export const SPDaily: Story = {
  args: {
    ...Basic.args,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const SPOverview: Story = {
  args: {
    ...Basic.args,
    initialViewMode: "overview",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

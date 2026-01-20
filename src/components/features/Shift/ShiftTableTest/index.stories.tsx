import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftTableTest } from ".";

const meta = {
  title: "Features/Shift/ShiftTableTest",
  component: ShiftTableTest,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftTableTest>;

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

// モックデータ: シフト
const mockShifts = [
  // Aさん: 1/21 10:00-18:00 (ホール→キッチン)
  {
    id: "shift1",
    staffId: "staff1",
    staffName: "Aさん",
    date: "2026-01-21",
    workingTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "14:00" },
      { id: "seg2", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "14:00", end: "18:00" },
    ],
  },
  // Bさん: 1/21 12:00-20:00 (キッチン→レジ)
  {
    id: "shift2",
    staffId: "staff2",
    staffName: "Bさん",
    date: "2026-01-21",
    workingTime: { start: "12:00", end: "20:00" },
    positions: [
      { id: "seg3", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "12:00", end: "16:00" },
      { id: "seg4", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "16:00", end: "20:00" },
    ],
  },
  // Dさん: 1/21 15:00-21:00 (ホールのみ)
  {
    id: "shift3",
    staffId: "staff4",
    staffName: "Dさん",
    date: "2026-01-21",
    workingTime: { start: "15:00", end: "21:00" },
    positions: [
      { id: "seg5", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "15:00", end: "21:00" },
    ],
  },
  // Aさん: 1/22 09:00-17:00 (ホール→休憩→ホール)
  {
    id: "shift4",
    staffId: "staff1",
    staffName: "Aさん",
    date: "2026-01-22",
    workingTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg6", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "12:00" },
      { id: "seg7", positionId: "pos4", positionName: "休憩", color: "#6b7280", start: "12:00", end: "13:00" },
      { id: "seg8", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "13:00", end: "17:00" },
    ],
  },
  // Bさん: 1/22 10:00-18:00 (レジのみ)
  {
    id: "shift5",
    staffId: "staff2",
    staffName: "Bさん",
    date: "2026-01-22",
    workingTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg9", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "10:00", end: "18:00" },
    ],
  },
];

// モックデータ: 日付（1週間分）
const mockDates = ["2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25", "2026-01-26", "2026-01-27"];

// 基本ストーリー
export const Basic: Story = {
  args: {
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 空の状態
export const Empty: Story = {
  args: {
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: [],
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 多くのスタッフ
export const ManyStaffs: Story = {
  args: {
    staffs: [
      ...mockStaffs,
      { id: "staff6", name: "Fさん", isSubmitted: true },
      { id: "staff7", name: "Gさん", isSubmitted: true },
      { id: "staff8", name: "Hさん", isSubmitted: true },
      { id: "staff9", name: "Iさん", isSubmitted: false },
      { id: "staff10", name: "Jさん", isSubmitted: true },
    ],
    positions: mockPositions,
    initialShifts: [
      ...mockShifts,
      {
        id: "shift6",
        staffId: "staff6",
        staffName: "Fさん",
        date: "2026-01-21",
        workingTime: { start: "11:00", end: "19:00" },
        positions: [
          { id: "seg10", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "11:00", end: "19:00" },
        ],
      },
      {
        id: "shift7",
        staffId: "staff7",
        staffName: "Gさん",
        date: "2026-01-21",
        workingTime: { start: "09:00", end: "15:00" },
        positions: [
          { id: "seg11", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "09:00", end: "15:00" },
        ],
      },
      {
        id: "shift8",
        staffId: "staff8",
        staffName: "Hさん",
        date: "2026-01-21",
        workingTime: { start: "16:00", end: "22:00" },
        positions: [
          { id: "seg12", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "16:00", end: "22:00" },
        ],
      },
      {
        id: "shift9",
        staffId: "staff10",
        staffName: "Jさん",
        date: "2026-01-21",
        workingTime: { start: "13:00", end: "21:00" },
        positions: [
          { id: "seg13", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "13:00", end: "17:00" },
          { id: "seg14", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "17:00", end: "21:00" },
        ],
      },
    ],
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 1日だけ
export const SingleDay: Story = {
  args: {
    staffs: mockStaffs.slice(0, 3),
    positions: mockPositions,
    initialShifts: mockShifts.filter((s) => s.date === "2026-01-21"),
    dates: ["2026-01-21"],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

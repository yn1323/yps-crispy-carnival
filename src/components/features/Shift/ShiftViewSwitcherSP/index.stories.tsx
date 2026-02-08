import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RequiredStaffingData } from "../ShiftOverview/types";
import { ShiftViewSwitcherSP } from ".";

const meta = {
  title: "Features/Shift/ShiftViewSwitcherSP",
  component: ShiftViewSwitcherSP,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <Box maxW="375px" w="375px" mx="auto" border="1px solid" borderColor="gray.200">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof ShiftViewSwitcherSP>;

export default meta;
type Story = StoryObj<typeof meta>;

// === モックデータ ===

const mockStaffs = [
  { id: "staff1", name: "田中太郎", isSubmitted: true },
  { id: "staff2", name: "佐藤花子", isSubmitted: true },
  { id: "staff3", name: "山田次郎", isSubmitted: false },
  { id: "staff4", name: "鈴木一郎", isSubmitted: true },
  { id: "staff5", name: "高橋美咲", isSubmitted: false },
];

const mockPositions = [
  { id: "pos1", name: "ホール", color: "#3b82f6" },
  { id: "pos2", name: "キッチン", color: "#f97316" },
  { id: "pos3", name: "レジ", color: "#10b981" },
  { id: "pos4", name: "休憩", color: "#6b7280" },
];

const mockDates = ["2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25", "2026-01-26", "2026-01-27"];

const mockShifts = [
  {
    id: "shift1",
    staffId: "staff1",
    staffName: "田中太郎",
    date: "2026-01-21",
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "12:00" },
      { id: "seg2", positionId: "pos4", positionName: "休憩", color: "#6b7280", start: "12:00", end: "13:00" },
      { id: "seg3", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "13:00", end: "17:00" },
    ],
  },
  {
    id: "shift2",
    staffId: "staff2",
    staffName: "佐藤花子",
    date: "2026-01-21",
    requestedTime: { start: "10:00", end: "15:00" },
    positions: [
      { id: "seg4", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "15:00" },
    ],
  },
  {
    id: "shift3",
    staffId: "staff4",
    staffName: "鈴木一郎",
    date: "2026-01-21",
    requestedTime: { start: "14:00", end: "21:00" },
    positions: [
      { id: "seg5", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "14:00", end: "18:00" },
      { id: "seg6", positionId: "pos4", positionName: "休憩", color: "#6b7280", start: "18:00", end: "19:00" },
      { id: "seg7", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "19:00", end: "21:00" },
    ],
  },
  {
    id: "shift4",
    staffId: "staff1",
    staffName: "田中太郎",
    date: "2026-01-22",
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg8", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "17:00" },
    ],
  },
];

const mockRequiredStaffing: RequiredStaffingData[] = [
  {
    dayOfWeek: 3,
    slots: [
      { hour: 10, position: "ホール", requiredCount: 2 },
      { hour: 10, position: "キッチン", requiredCount: 1 },
      { hour: 14, position: "ホール", requiredCount: 3 },
      { hour: 14, position: "キッチン", requiredCount: 2 },
    ],
  },
];

// === ストーリー ===

export const Basic: Story = {
  args: {
    shopId: "shop1",
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

export const WithRequiredStaffing: Story = {
  args: {
    ...Basic.args,
    holidays: ["2026-01-23"],
    requiredStaffing: mockRequiredStaffing,
  },
};

import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { SortMode } from "../ShiftTableTest/types";
import { ShiftOverviewCardSP } from ".";

const ShiftOverviewCardSPStory = (props: React.ComponentProps<typeof ShiftOverviewCardSP>) => {
  const [sortMode, setSortMode] = useState<SortMode>("default");
  return <ShiftOverviewCardSP {...props} sortMode={sortMode} onSortModeChange={setSortMode} />;
};

const meta = {
  title: "Features/Shift/ShiftOverviewCardSP",
  component: ShiftOverviewCardSPStory,
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
} satisfies Meta<typeof ShiftOverviewCardSPStory>;

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
    ],
  },
  {
    id: "shift4",
    staffId: "staff1",
    staffName: "田中太郎",
    date: "2026-01-22",
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg6", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "17:00" },
    ],
  },
  {
    id: "shift5",
    staffId: "staff2",
    staffName: "佐藤花子",
    date: "2026-01-22",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg7", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "10:00", end: "18:00" },
    ],
  },
];

// === ストーリー ===

export const Basic: Story = {
  args: {
    shopId: "shop1",
    dates: mockDates,
    staffs: mockStaffs,
    shifts: mockShifts,
    sortMode: "default",
    onSortModeChange: () => {},
  },
};

export const WithHoliday: Story = {
  args: {
    ...Basic.args,
    holidays: ["2026-01-23"],
  },
};

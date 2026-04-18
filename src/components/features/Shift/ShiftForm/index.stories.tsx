import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from ".";
import {
  mockDates,
  mockPositions,
  mockShifts,
  mockShiftsAllPatterns,
  mockShiftsRequestOnly,
  mockStaffs,
  mockTimeRange,
} from "./__mocks__/storyData";

const baseArgs = {
  shopId: "shop1",
  staffs: mockStaffs,
  positions: mockPositions,
  initialShifts: mockShifts,
  dates: mockDates,
  timeRange: mockTimeRange,
  holidays: [],
};

const meta = {
  title: "Features/Shift/ShiftForm",
  component: ShiftForm,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// 基本: 日別ビュー・混合パターン
export const Basic: Story = { args: baseArgs };

// 希望のみ（シフト未割当）
export const RequestOnly: Story = {
  args: {
    ...baseArgs,
    dates: ["2026-01-22"],
    initialShifts: mockShiftsRequestOnly,
  },
};

// 全パターン網羅（希望+一致 / 希望のみ / 未提出+手動 / 休憩あり / 未提出なし）
export const AllPatterns: Story = {
  args: {
    ...baseArgs,
    dates: ["2026-01-23"],
    initialShifts: mockShiftsAllPatterns,
  },
};

// シフト未割当状態（希望ありだけ）
export const UnassignedOnly: Story = {
  args: {
    ...baseArgs,
    initialShifts: mockShifts.map((s) => ({ ...s, positions: [] })),
  },
};

// シフトが何もない日
export const EmptyDay: Story = {
  args: {
    ...baseArgs,
    dates: ["2026-02-01"],
    initialShifts: [],
  },
};

// 読み取り専用
export const ReadOnly: Story = {
  args: { ...baseArgs, isReadOnly: true, currentStaffId: "staff1" },
};

// 確定済み
export const Confirmed: Story = {
  args: { ...baseArgs, isConfirmed: true },
};

// 一覧ビュー初期表示
export const OverviewInitial: Story = {
  args: { ...baseArgs, initialViewMode: "overview" },
};

// SP: 日別
export const SPDaily: Story = {
  args: baseArgs,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

// SP: 一覧
export const SPOverview: Story = {
  args: { ...baseArgs, initialViewMode: "overview" },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

// SP: 全パターン
export const SPAllPatterns: Story = {
  args: {
    ...baseArgs,
    dates: ["2026-01-23"],
    initialShifts: mockShiftsAllPatterns,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

// SP: 読み取り専用
export const SPReadOnly: Story = {
  args: { ...baseArgs, isReadOnly: true, currentStaffId: "staff1" },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

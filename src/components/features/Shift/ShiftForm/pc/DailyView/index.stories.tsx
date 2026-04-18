import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  JotaiStoryWrapper,
  mockShifts,
  mockShiftsAllPatterns,
  mockShiftsRequestOnly,
  mockStaffs,
} from "../../__mocks__/storyData";
import { DailyView } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/PC/DailyView",
  component: DailyView,
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
} satisfies Meta<typeof DailyView>;

export default meta;
type Story = StoryObj<typeof meta>;

// デフォルト: 1/21 (基本の混合パターン)
export const Basic: Story = {
  render: () => (
    <JotaiStoryWrapper>
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// 希望のみ（シフト未割当）: 1/22
export const RequestOnly: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        dates: ["2026-01-22"],
        initialShifts: mockShiftsRequestOnly,
      }}
    >
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// 全パターン網羅: 1/23
// A=希望+一致, B=希望のみ, C=未提出+手動, D=休憩あり, E=未提出で何もなし
export const AllPatterns: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        dates: ["2026-01-23"],
        initialShifts: mockShiftsAllPatterns,
      }}
    >
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// 休憩を含むシフト
export const WithBreak: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        dates: ["2026-01-23"],
        initialShifts: [mockShiftsAllPatterns.find((s) => s.staffId === "staff4")].filter(
          (s): s is NonNullable<typeof s> => s !== undefined,
        ),
        staffs: mockStaffs.filter((s) => s.id === "staff4"),
      }}
    >
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// シフトが何もない日
export const EmptyDay: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        dates: ["2026-02-01"],
        initialShifts: [],
      }}
    >
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// 読み取り専用（編集UI・保存/確定ボタンなし）
export const ReadOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ isReadOnly: true, currentStaffId: "staff1" }}>
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// 全員未提出（誰もシフト希望を出していない）
export const AllUnsubmitted: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        staffs: mockStaffs.map((s) => ({ ...s, isSubmitted: false })),
        initialShifts: [],
      }}
    >
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

// 希望はあるがどのシフトも未割当（シフト作成前の状態）
export const UnassignedOnly: Story = {
  render: () => (
    <JotaiStoryWrapper
      overrides={{
        initialShifts: mockShifts.map((s) => ({ ...s, positions: [] })),
      }}
    >
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

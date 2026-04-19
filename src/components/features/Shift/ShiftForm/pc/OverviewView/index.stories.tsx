import type { Meta, StoryObj } from "@storybook/react-vite";
import { JotaiStoryWrapper, mockDatesMidWeekStart, mockHolidays } from "../../__mocks__/storyData";
import { OverviewView } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/PC/OverviewView",
  component: OverviewView,
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
} satisfies Meta<typeof OverviewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview" }}>
      <OverviewView />
    </JotaiStoryWrapper>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview", isReadOnly: true, currentStaffId: "staff1" }}>
      <OverviewView />
    </JotaiStoryWrapper>
  ),
};

export const WithHolidays: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview", holidays: mockHolidays }}>
      <OverviewView />
    </JotaiStoryWrapper>
  ),
};

// 水曜開始 2 週間。月曜起算で先頭の月火と末尾の火〜日が期間外セルになる
export const MidWeekStart: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview", dates: mockDatesMidWeekStart }}>
      <OverviewView />
    </JotaiStoryWrapper>
  ),
};

// 日曜起算で同じ期間を表示するケース
export const SundayStart: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview", dates: mockDatesMidWeekStart }}>
      <OverviewView weekStart="sun" />
    </JotaiStoryWrapper>
  ),
};

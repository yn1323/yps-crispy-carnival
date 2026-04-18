import type { Meta, StoryObj } from "@storybook/react-vite";
import { JotaiStoryWrapper, mockHolidays } from "../../__mocks__/storyData";
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

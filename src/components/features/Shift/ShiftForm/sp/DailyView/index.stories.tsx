import type { Meta, StoryObj } from "@storybook/react-vite";
import { JotaiStoryWrapper } from "../../__mocks__/storyData";
import { SPDailyView } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/SP/DailyView",
  component: SPDailyView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SPDailyView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <JotaiStoryWrapper>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ isReadOnly: true, currentStaffId: "staff1" }}>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

export const NoShifts: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialShifts: [] }}>
      <SPDailyView />
    </JotaiStoryWrapper>
  ),
};

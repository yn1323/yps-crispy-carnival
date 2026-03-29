import type { Meta, StoryObj } from "@storybook/react-vite";
import { JotaiStoryWrapper, mockRequiredStaffing } from "../../__mocks__/storyData";
import { DailyView } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/PC/DailyView",
  component: DailyView,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DailyView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <JotaiStoryWrapper>
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ isReadOnly: true, currentStaffId: "staff1" }}>
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

export const WithRequiredStaffing: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ requiredStaffing: mockRequiredStaffing }}>
      <DailyView />
    </JotaiStoryWrapper>
  ),
};

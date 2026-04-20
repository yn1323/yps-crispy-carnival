import type { Meta, StoryObj } from "@storybook/react-vite";
import { JotaiStoryWrapper } from "../../__mocks__/storyData";
import { SPOverviewView } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/SP/OverviewView",
  component: SPOverviewView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SPOverviewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview" }}>
      <SPOverviewView />
    </JotaiStoryWrapper>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <JotaiStoryWrapper overrides={{ initialViewMode: "overview", isReadOnly: true }}>
      <SPOverviewView />
    </JotaiStoryWrapper>
  ),
};

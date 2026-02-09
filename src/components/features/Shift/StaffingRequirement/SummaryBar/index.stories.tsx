import type { Meta, StoryObj } from "@storybook/react-vite";
import { SummaryBar } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/SummaryBar",
  component: SummaryBar,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof SummaryBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    weeklyTotalPersonHours: 245,
    peakInfo: { day: "金", hour: "12:00", count: 8 },
    configuredDaysCount: 5,
  },
};

export const NoData: Story = {
  args: {
    weeklyTotalPersonHours: 0,
    peakInfo: null,
    configuredDaysCount: 0,
  },
};

export const AllDaysConfigured: Story = {
  args: {
    weeklyTotalPersonHours: 392,
    peakInfo: { day: "土", hour: "18:00", count: 12 },
    configuredDaysCount: 7,
  },
};

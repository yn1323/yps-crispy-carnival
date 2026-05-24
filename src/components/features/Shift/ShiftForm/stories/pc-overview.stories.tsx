import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import { fullscreenParameters, overviewCalendarRangeArgs, shiftFormDecorators } from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Overview",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeTwoWeeks: Story = {
  name: "Two Weeks",
  args: overviewCalendarRangeArgs,
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...overviewCalendarRangeArgs, isReadOnly: true, currentStaffId: "staff1" },
};

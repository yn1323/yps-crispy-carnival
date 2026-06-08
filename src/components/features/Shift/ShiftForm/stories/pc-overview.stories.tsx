import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import { expectVisibleText, fullscreenParameters, overviewCalendarRangeArgs, shiftFormDecorators } from "./shared";

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
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "1/19–1/25");
    await expectVisibleText(canvasElement, "1/19月期間外");
    await expectVisibleText(canvasElement, "1/20火期間外");
  },
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...overviewCalendarRangeArgs, isReadOnly: true, currentStaffId: "staff1" },
};

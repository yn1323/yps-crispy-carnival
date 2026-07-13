import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  fullscreenParameters,
  overnightArgs,
  overviewCalendarRangeArgs,
  shiftFormDecorators,
  validationWarningArgs,
} from "./shared";

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

export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: { ...validationWarningArgs, initialViewMode: "overview" as const },
};

export const TimeOvernight: Story = {
  name: "Overnight",
  args: { ...overnightArgs, initialViewMode: "overview" as const },
};

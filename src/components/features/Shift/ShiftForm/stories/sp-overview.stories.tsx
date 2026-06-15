import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  expectVisibleText,
  fullscreenParameters,
  mobileGlobals,
  overnightArgs,
  overviewCalendarRangeArgs,
  shiftFormDecorators,
  validationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Overview",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeTwoWeeks: Story = {
  name: "Two Weeks",
  args: overviewCalendarRangeArgs,
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "1/19–1/25");
    await expectVisibleText(canvasElement, "1/19月期間外");
    await expectVisibleText(canvasElement, "1/20火期間外");
    await expectVisibleText(canvasElement, "1/21水");
  },
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...overviewCalendarRangeArgs, isReadOnly: true, currentStaffId: "staff1" },
  globals: mobileGlobals,
};

export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: { ...validationWarningArgs, initialViewMode: "overview" as const },
  globals: mobileGlobals,
};

export const TimeOvernight: Story = {
  name: "Overnight",
  args: { ...overnightArgs, initialViewMode: "overview" as const },
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "21:00–翌5:00");
    await expectVisibleText(canvasElement, "18:00–翌2:00");
  },
};

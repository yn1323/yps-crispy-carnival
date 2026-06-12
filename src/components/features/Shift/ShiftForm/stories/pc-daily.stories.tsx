import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  expectVisibleText,
  fullscreenParameters,
  halfHourBusinessHoursArgs,
  overnightArgs,
  shiftFormDecorators,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Daily",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeBasic: Story = {
  name: "Basic",
  args: allPatternsArgs,
};

export const TimeHalfHourBusinessHours: Story = {
  name: "Half Hour Business Hours",
  args: halfHourBusinessHoursArgs,
};

export const TimeOvernight: Story = {
  name: "Overnight",
  args: overnightArgs,
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "21:00–翌5:00");
    await expectVisibleText(canvasElement, "翌5:00");
  },
};

export const TimeEmptyOrAllUnsubmitted: Story = {
  name: "Empty Or All Unsubmitted",
  args: emptyOrAllUnsubmittedArgs,
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
};

export const TimeConfirmed: Story = {
  name: "Confirmed",
  args: { ...allPatternsArgs, isConfirmed: true },
};

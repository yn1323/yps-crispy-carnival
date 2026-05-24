import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  fullscreenParameters,
  halfHourBusinessHoursArgs,
  mobileGlobals,
  shiftFormDecorators,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Daily",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeBasic: Story = {
  name: "Basic",
  args: allPatternsArgs,
  globals: mobileGlobals,
};

export const TimeHalfHourBusinessHours: Story = {
  name: "Half Hour Business Hours",
  args: halfHourBusinessHoursArgs,
  globals: mobileGlobals,
};

export const TimeEmptyOrAllUnsubmitted: Story = {
  name: "Empty Or All Unsubmitted",
  args: emptyOrAllUnsubmittedArgs,
  globals: mobileGlobals,
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
  globals: mobileGlobals,
};

export const TimeConfirmed: Story = {
  name: "Confirmed",
  args: { ...allPatternsArgs, isConfirmed: true },
  globals: mobileGlobals,
};

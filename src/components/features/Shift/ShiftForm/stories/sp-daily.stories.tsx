import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  expectVisibleText,
  fullscreenParameters,
  halfHourBusinessHoursArgs,
  mobileGlobals,
  overnightArgs,
  shiftFormDecorators,
  validationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Daily",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
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

export const TimeOvernight: Story = {
  name: "Overnight",
  args: overnightArgs,
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "21:00–翌5:00");
  },
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

// 確認事項（ワーニング）: SP日別でのDateRailバッジ＋スタッフカード/行の理由アイコン
export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: validationWarningArgs,
  globals: mobileGlobals,
};

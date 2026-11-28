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

/** スタッフの名前が長いときは、1行に収めて省略する。 */
export const TimeLongStaffNames: Story = {
  name: "Long Staff Names",
  args: {
    ...overviewCalendarRangeArgs,
    staffs: overviewCalendarRangeArgs.staffs.map((staff) => ({
      ...staff,
      name: `${staff.name}（上限の文字数で表示を確かめるための長い名前です）`,
    })),
  },
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

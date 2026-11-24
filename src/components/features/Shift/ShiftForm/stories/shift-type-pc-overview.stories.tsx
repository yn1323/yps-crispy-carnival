import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  desktopGlobals,
  fullscreenParameters,
  shiftFormDecorators,
  shiftTypeArgs,
  shiftTypeValidationWarningArgs,
} from "./shared";
import { shiftTypeBoardLongNamesArgs } from "./shiftTypeBoardFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Overview",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: { ...shiftTypeArgs, initialViewMode: "overview" },
  globals: desktopGlobals,
};

/** くわしく表示で名前が長いときは、スタッフ・勤務パターン・ポジションをそれぞれ1行に収めて省略する。 */
export const LongNames: Story = {
  name: "Long Names",
  args: { ...shiftTypeBoardLongNamesArgs, initialViewMode: "overview" },
  globals: desktopGlobals,
};

/** シンプル表示で名前が長いときも、スタッフと勤務パターンを1行に収めて省略する。 */
export const LongNamesSimple: Story = {
  name: "Long Names Simple",
  args: { ...shiftTypeBoardLongNamesArgs, initialDetailMode: false, initialViewMode: "overview" },
  globals: desktopGlobals,
};

export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: { ...shiftTypeValidationWarningArgs, initialViewMode: "overview" },
  globals: desktopGlobals,
};

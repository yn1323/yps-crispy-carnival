import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
  shiftTypeArgs,
  shiftTypeValidationWarningArgs,
} from "./shared";
import { shiftTypeBoardLongNamesArgs } from "./shiftTypeBoardFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Overview",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: { ...shiftTypeArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

/** くわしく表示で名前が長いときは、スタッフ・勤務パターン・ポジションをそれぞれ1行に収めて省略する。 */
export const LongNames: Story = {
  name: "Long Names",
  args: { ...shiftTypeBoardLongNamesArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

/** シンプル表示で名前が長いときも、スタッフと勤務パターンを1行に収めて省略する。 */
export const LongNamesSimple: Story = {
  name: "Long Names Simple",
  args: { ...shiftTypeBoardLongNamesArgs, initialDetailMode: false, initialViewMode: "overview" },
  globals: mobileGlobals,
};

export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: { ...shiftTypeValidationWarningArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

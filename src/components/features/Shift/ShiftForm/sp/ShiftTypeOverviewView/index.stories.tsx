import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { shiftTypeDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Overview Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 勤務パターンの色は保ち、ポジションと熟練度と休憩の印を添える。 */
export const Detail: Story = {
  args: { ...shiftTypeDetailArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

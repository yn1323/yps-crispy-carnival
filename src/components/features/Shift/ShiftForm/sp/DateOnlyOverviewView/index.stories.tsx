import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { dateOnlyDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/SP/Overview Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const overviewArgs = { ...dateOnlyDetailArgs, initialViewMode: "overview" as const };

/** 名前の横に熟練度、右端にポジションと休憩の印を出す。 */
export const Detail: Story = {
  args: overviewArgs,
  globals: mobileGlobals,
};

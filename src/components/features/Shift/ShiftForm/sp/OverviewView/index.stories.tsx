import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "../..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators } from "../../stories/shared";
import { timeDetailArgs } from "../detailStoryFixtures";

const meta = {
  title: "Features/Shift/ShiftForm/Time/SP/Overview Detail",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const overviewArgs = { ...timeDetailArgs, initialViewMode: "overview" as const };

/** 名前の横に熟練度、時刻の横に休憩の印、下の行にポジションを出す。 */
export const Detail: Story = {
  args: overviewArgs,
  globals: mobileGlobals,
};

/** 閲覧専用でも、ポジションと休憩は出す。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...overviewArgs, isReadOnly: true, displayMode: "confirmed", onDetailModeChange: undefined },
  globals: mobileGlobals,
};

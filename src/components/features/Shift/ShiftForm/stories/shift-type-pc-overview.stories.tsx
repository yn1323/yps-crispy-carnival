import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import { desktopGlobals, expectVisibleText, fullscreenParameters, shiftFormDecorators, shiftTypeArgs } from "./shared";

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
  play: async ({ canvasElement }) => {
    await expectVisibleText(canvasElement, "5/18–5/24");
    await expectVisibleText(canvasElement, "5/18月期間外");
    await expectVisibleText(canvasElement, "5/19火期間外");
    await expectVisibleText(canvasElement, "5/20水期間外");
  },
};

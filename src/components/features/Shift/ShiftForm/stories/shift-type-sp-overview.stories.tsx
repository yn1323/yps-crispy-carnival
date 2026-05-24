import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import { fullscreenParameters, mobileGlobals, shiftFormDecorators, shiftTypeArgs } from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Overview",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: { ...shiftTypeArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

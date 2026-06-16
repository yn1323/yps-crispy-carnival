import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
  shiftTypeArgs,
  shiftTypeValidationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/SP/Daily",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: shiftTypeArgs,
  globals: mobileGlobals,
};

export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: shiftTypeValidationWarningArgs,
  globals: mobileGlobals,
};

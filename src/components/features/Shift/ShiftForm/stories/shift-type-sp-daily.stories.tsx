import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftForm } from "..";
import {
  expectStaffNoteIconOpensOnTap,
  expectWarningIconOpensOnTap,
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
  shiftTypeArgs,
  shiftTypeDateNotesArgs,
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

export const WithDateNotes: Story = {
  args: shiftTypeDateNotesArgs,
  globals: mobileGlobals,
};

/** 連絡事項を非表示にしたときだけ名前の右にアイコンを出し、タップで本文を開く。 */
export const DateNotesHiddenIconInteractive: Story = {
  args: shiftTypeDateNotesArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expectStaffNoteIconOpensOnTap(canvasElement, "17時以降なら入れます");
  },
};

export const ValidationWarningIconInteractive: Story = {
  args: shiftTypeValidationWarningArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expectWarningIconOpensOnTap(canvasElement);
  },
};

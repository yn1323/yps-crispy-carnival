import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnsavedChangesDialog } from "./index";

const meta = {
  title: "Features/ShiftBoard/UnsavedChangesDialog",
  component: UnsavedChangesDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    isOpen: true,
    onStay: () => {},
    onLeaveWithoutSaving: () => {},
    onSaveAndLeave: () => {},
  },
} satisfies Meta<typeof UnsavedChangesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Saving: Story = {
  args: {
    isSaving: true,
  },
};

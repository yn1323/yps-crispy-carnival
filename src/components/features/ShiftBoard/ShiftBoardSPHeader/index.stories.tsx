import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftBoardSPHeader } from "./index";

const meta = {
  title: "Features/ShiftBoard/ShiftBoardSPHeader",
  component: ShiftBoardSPHeader,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftBoardSPHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日) のシフト",
    confirmedAt: null,
    onSave: () => {},
    onConfirm: () => {},
    viewMode: "daily",
    onViewModeChange: () => {},
  },
};

export const Confirmed: Story = {
  args: {
    ...Normal.args,
    confirmedAt: new Date("2026-03-28T23:15:00"),
    viewMode: "overview",
  },
};

export const Saving: Story = {
  args: {
    ...Normal.args,
    isSaving: true,
  },
};

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
    submittedCount: 8,
    totalStaffCount: 10,
    confirmedAt: null,
    onBack: () => {},
    onSave: () => {},
    onConfirm: () => {},
  },
};

export const AllSubmitted: Story = {
  args: {
    ...Normal.args,
    submittedCount: 10,
  },
};

export const Confirmed: Story = {
  args: {
    ...Normal.args,
    submittedCount: 10,
    confirmedAt: new Date("2026-03-28T23:15:00"),
  },
};

export const Saving: Story = {
  args: {
    ...Normal.args,
    isSaving: true,
  },
};

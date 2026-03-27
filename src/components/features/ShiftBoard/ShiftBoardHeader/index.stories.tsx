import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftBoardHeader } from "./index";

const meta = {
  title: "Features/ShiftBoard/ShiftBoardHeader",
  component: ShiftBoardHeader,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftBoardHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日) のシフト",
    submittedCount: 8,
    totalStaffCount: 10,
    confirmedAt: null,
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

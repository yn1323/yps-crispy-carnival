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
    confirmedAt: null,
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

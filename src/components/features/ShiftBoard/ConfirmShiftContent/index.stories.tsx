import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmShiftContent } from "./index";

const meta = {
  title: "Features/ShiftBoard/ConfirmShiftContent",
  component: ConfirmShiftContent,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ConfirmShiftContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    staffCount: 10,
    periodLabel: "1/20(月)〜1/26(日)",
  },
};

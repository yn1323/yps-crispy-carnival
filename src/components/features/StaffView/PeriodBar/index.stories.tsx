import type { Meta, StoryObj } from "@storybook/react-vite";
import { PeriodBar } from "./index";

const meta = {
  title: "features/StaffView/PeriodBar",
  component: PeriodBar,
} satisfies Meta<typeof PeriodBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
  },
};

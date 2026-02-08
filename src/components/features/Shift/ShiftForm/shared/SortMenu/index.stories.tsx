import type { Meta, StoryObj } from "@storybook/react-vite";
import { SortMenu } from ".";

const meta = {
  title: "Features/Shift/ShiftForm/SortMenu",
  component: SortMenu,
} satisfies Meta<typeof SortMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    sortMode: "default",
    onSortChange: () => {},
  },
};

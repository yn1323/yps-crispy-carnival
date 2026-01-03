import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftsTab } from ".";

const meta = {
  title: "Features/Shop/StaffDetail/TabContents/ShiftsTab",
  component: ShiftsTab,
} satisfies Meta<typeof ShiftsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftsTab } from ".";

const meta: Meta<typeof ShiftsTab> = {
  component: ShiftsTab,
  title: "Features/User/UserDetail/TabContents/ShiftsTab",
};

export default meta;

type Story = StoryObj<typeof ShiftsTab>;

export const Basic: Story = {};

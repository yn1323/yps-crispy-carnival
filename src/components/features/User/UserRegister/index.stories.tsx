import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserRegister } from ".";

const meta = {
  title: "Features/User/UserRegister",
  component: UserRegister,
} satisfies Meta<typeof UserRegister>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

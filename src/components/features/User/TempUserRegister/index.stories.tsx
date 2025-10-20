import type { Meta, StoryObj } from "@storybook/react-vite";
import { TempUserRegister } from ".";

const meta = {
  title: "Features/User/TempUserRegister",
  component: TempUserRegister,
  args: {
    shopId: "test-shop-id",
  },
} satisfies Meta<typeof TempUserRegister>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

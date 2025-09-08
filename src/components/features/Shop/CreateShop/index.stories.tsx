import type { Meta, StoryObj } from "@storybook/react-vite";
import { CreateShop } from ".";

const meta = {
  title: "features/Shop/CreateShop",
  component: CreateShop,
  args: {},
  parameters: {},
} satisfies Meta<typeof CreateShop>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};

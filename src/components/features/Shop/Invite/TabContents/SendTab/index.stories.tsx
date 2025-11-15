import type { Meta, StoryObj } from "@storybook/react-vite";
import { SendTab } from "./index";

const meta = {
  title: "Features/Shop/Invite/SendTab",
  component: SendTab,
  parameters: {
    layout: "padded",
  },
  args: {
    shopId: "mock-shop-id",
  },
} satisfies Meta<typeof SendTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

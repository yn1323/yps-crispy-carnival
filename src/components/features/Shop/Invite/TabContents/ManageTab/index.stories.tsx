import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManageTab } from "./index";

const meta = {
  title: "Features/Shop/Invite/ManageTab",
  component: ManageTab,
  parameters: {
    layout: "padded",
  },
  args: {
    shopId: "mock-shop-id",
  },
} satisfies Meta<typeof ManageTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

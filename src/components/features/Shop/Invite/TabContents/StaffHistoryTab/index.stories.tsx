import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffHistoryTab } from "./index";

const meta = {
  title: "Features/Shop/Invite/StaffHistoryTab",
  component: StaffHistoryTab,
  parameters: {
    layout: "padded",
  },
  args: {
    shopId: "mock-shop-id",
  },
} satisfies Meta<typeof StaffHistoryTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

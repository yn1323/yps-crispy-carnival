import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteShopStaff } from "./index";

const meta = {
  title: "Features/Shop/Invite/InviteShopStaff",
  component: InviteShopStaff,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof InviteShopStaff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteShopMember } from "./index";

const meta = {
  title: "Features/Shop/Invite/InviteShopMember",
  component: InviteShopMember,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof InviteShopMember>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

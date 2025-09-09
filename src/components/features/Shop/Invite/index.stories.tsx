import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteShopMember } from ".";

const meta = {
  title: "features/Shop/Invite",
  component: InviteShopMember,
  args: {},
  parameters: {},
} satisfies Meta<typeof InviteShopMember>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};

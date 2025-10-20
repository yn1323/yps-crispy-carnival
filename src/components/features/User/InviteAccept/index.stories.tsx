import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteAccept } from ".";

const meta = {
  title: "Features/User/InviteAccept",
  component: InviteAccept,
  args: {
    token: "test-token-123",
  },
} satisfies Meta<typeof InviteAccept>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

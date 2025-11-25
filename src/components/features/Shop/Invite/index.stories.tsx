import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteShopStaff } from "./index";
import type { InvitationType } from "./TabContents/ManageTab";

const mockInvitations: InvitationType[] = [
  {
    _id: "1",
    displayName: "山田太郎",
    role: "staff",
    inviteExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    inviteToken: "mock-token-1",
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    isExpired: false,
    invitedBy: { _id: "user1", name: "オーナー" },
  },
  {
    _id: "2",
    displayName: "佐藤花子",
    role: "manager",
    inviteExpiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    inviteToken: "mock-token-2",
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    isExpired: false,
    invitedBy: { _id: "user1", name: "オーナー" },
  },
];

const meta = {
  title: "Features/Shop/Invite/InviteShopStaff",
  component: InviteShopStaff,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    invitations: mockInvitations,
  },
} satisfies Meta<typeof InviteShopStaff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

// 招待なし
export const Empty: Story = {
  args: {
    invitations: [],
  },
};

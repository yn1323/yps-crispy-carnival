import type { Meta, StoryObj } from "@storybook/react-vite";
import type { InvitationType } from "./index";
import { ManageTab } from "./index";

const mockInvitations: InvitationType[] = [
  {
    _id: "1",
    displayName: "山田太郎",
    role: "staff",
    inviteExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7日後
    inviteToken: "mock-token-1",
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2日前
    isExpired: false,
    invitedBy: { _id: "user1", name: "オーナー" },
  },
  {
    _id: "2",
    displayName: "佐藤花子",
    role: "manager",
    inviteExpiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3日後
    inviteToken: "mock-token-2",
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5日前
    isExpired: false,
    invitedBy: { _id: "user1", name: "オーナー" },
  },
  {
    _id: "3",
    displayName: "田中一郎",
    role: "staff",
    inviteExpiresAt: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1日前（期限切れ）
    inviteToken: undefined,
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10日前
    isExpired: true,
    invitedBy: { _id: "user1", name: "オーナー" },
  },
];

const meta = {
  title: "Features/Shop/Invite/ManageTab",
  component: ManageTab,
  parameters: {
    layout: "padded",
  },
  args: {
    invitations: mockInvitations,
  },
} satisfies Meta<typeof ManageTab>;

export default meta;
type Story = StoryObj<typeof meta>;

// 招待あり
export const Basic: Story = {};

// 空の状態
export const Empty: Story = {
  args: {
    invitations: [],
  },
};

// 招待中のみ
export const ActiveOnly: Story = {
  args: {
    invitations: mockInvitations.filter((inv) => !inv.isExpired),
  },
};

// 期限切れのみ
export const ExpiredOnly: Story = {
  args: {
    invitations: mockInvitations.filter((inv) => inv.isExpired),
  },
};

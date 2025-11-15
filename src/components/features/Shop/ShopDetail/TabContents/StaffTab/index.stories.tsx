import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffTab } from ".";

const meta: Meta<typeof StaffTab> = {
  component: StaffTab,
  title: "Features/Shop/ShopDetail/TabContents/StaffTab",
};

export default meta;

type Story = StoryObj<typeof StaffTab>;

const mockUsers = [
  {
    _id: "user1" as Id<"users">,
    name: "山田太郎",
    authId: "auth1",
    role: "owner",
    createdAt: Date.now(),
  },
  {
    _id: "user2" as Id<"users">,
    name: "佐藤花子",
    authId: "auth2",
    role: "manager",
    createdAt: Date.now(),
  },
  {
    _id: "user3" as Id<"users">,
    name: "鈴木一郎",
    authId: "auth3",
    role: "staff",
    createdAt: Date.now(),
  },
  {
    _id: "user4" as Id<"users">,
    name: "田中美咲",
    authId: "auth4",
    role: "staff",
    createdAt: Date.now(),
  },
  {
    _id: "user5" as Id<"users">,
    name: "高橋健太",
    authId: "auth5",
    role: "staff",
    createdAt: Date.now(),
  },
];

export const Basic: Story = {
  args: {
    shop: {
      _id: "shop123" as Id<"shops">,
      _creationTime: Date.now(),
      shopName: "サンプル店舗",
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: 30,
      submitFrequency: "2w",
      useTimeCard: true,
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user123",
    },
    users: mockUsers,
    canEdit: true,
  },
};

export const Empty: Story = {
  args: {
    shop: {
      _id: "shop789" as Id<"shops">,
      _creationTime: Date.now(),
      shopName: "スタッフなし店舗",
      openTime: "08:00",
      closeTime: "23:00",
      timeUnit: 30,
      submitFrequency: "1m",
      useTimeCard: true,
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user789",
    },
    users: [],
    canEdit: true,
  },
};

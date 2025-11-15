import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffTab } from ".";

const meta: Meta<typeof StaffTab> = {
  component: StaffTab,
  title: "Features/Shop/ShopDetail/TabContents/StaffTab",
};

export default meta;

type Story = StoryObj<typeof StaffTab>;

const mockUsers = [
  {
    _id: "user1" as any,
    name: "山田太郎",
    authId: "auth1",
    role: "owner",
    createdAt: Date.now(),
  },
  {
    _id: "user2" as any,
    name: "佐藤花子",
    authId: "auth2",
    role: "manager",
    createdAt: Date.now(),
  },
  {
    _id: "user3" as any,
    name: "鈴木一郎",
    authId: "auth3",
    role: "staff",
    createdAt: Date.now(),
  },
  {
    _id: "user4" as any,
    name: "田中美咲",
    authId: "auth4",
    role: "staff",
    createdAt: Date.now(),
  },
  {
    _id: "user5" as any,
    name: "高橋健太",
    authId: "auth5",
    role: "staff",
    createdAt: Date.now(),
  },
];

export const Basic: Story = {
  args: {
    shop: {
      _id: "shop123" as any,
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

export const CannotEdit: Story = {
  args: {
    shop: {
      _id: "shop456" as any,
      _creationTime: Date.now(),
      shopName: "閲覧のみ店舗",
      openTime: "10:00",
      closeTime: "20:00",
      timeUnit: 15,
      submitFrequency: "1w",
      useTimeCard: false,
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user456",
    },
    users: mockUsers,
    canEdit: false,
  },
};

export const EmptyStaff: Story = {
  args: {
    shop: {
      _id: "shop789" as any,
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

export const ManyStaff: Story = {
  args: {
    shop: {
      _id: "shop999" as any,
      _creationTime: Date.now(),
      shopName: "大規模店舗",
      openTime: "09:00",
      closeTime: "22:00",
      timeUnit: 30,
      submitFrequency: "2w",
      useTimeCard: true,
      createdAt: Date.now(),
      isDeleted: false,
      createdBy: "user999",
    },
    users: [
      ...mockUsers,
      {
        _id: "user6" as any,
        name: "伊藤さくら",
        authId: "auth6",
        role: "staff",
        createdAt: Date.now(),
      },
      {
        _id: "user7" as any,
        name: "渡辺大輔",
        authId: "auth7",
        role: "staff",
        createdAt: Date.now(),
      },
      {
        _id: "user8" as any,
        name: "中村陽子",
        authId: "auth8",
        role: "manager",
        createdAt: Date.now(),
      },
    ],
    canEdit: true,
  },
};

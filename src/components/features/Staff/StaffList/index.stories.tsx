import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffList } from ".";

const meta: Meta<typeof StaffList> = {
  component: StaffList,
  title: "Features/Shop/StaffList",
};

export default meta;

type Story = StoryObj<typeof StaffList>;

const mockShop = {
  _id: "shop1" as Id<"shops">,
  shopName: "本店",
  openTime: "09:00",
  closeTime: "21:00",
  timeUnit: 30 as const,
  submitFrequency: "2w" as const,
  description: "駅前の本店です",
  positions: ["ホール", "キッチン", "レジ"],
  _creationTime: Date.now(),
  createdAt: Date.now(),
  createdBy: "auth1",
  isDeleted: false,
};

const mockStaffs = [
  {
    _id: "staff1" as Id<"staffs">,
    email: "yamada@example.com",
    displayName: "山田太郎",
    status: "active",
    skills: [
      { position: "ホール", level: "ベテラン" },
      { position: "キッチン", level: "一人前" },
    ],
    createdAt: Date.now(),
    isManager: true,
  },
  {
    _id: "staff2" as Id<"staffs">,
    email: "sato@example.com",
    displayName: "佐藤花子",
    status: "active",
    skills: [{ position: "レジ", level: "研修中" }],
    createdAt: Date.now(),
    isManager: false,
  },
  {
    _id: "staff3" as Id<"staffs">,
    email: "suzuki@example.com",
    displayName: "鈴木一郎",
    status: "pending",
    skills: [],
    createdAt: Date.now(),
    isManager: false,
  },
  {
    _id: "staff4" as Id<"staffs">,
    email: "tanaka@example.com",
    displayName: "田中美咲",
    status: "active",
    skills: [{ position: "ホール", level: "未経験" }],
    createdAt: Date.now(),
    isManager: true,
  },
  {
    _id: "staff5" as Id<"staffs">,
    email: "takahashi@example.com",
    displayName: "高橋健太",
    status: "resigned",
    skills: [{ position: "キッチン", level: "ベテラン" }],
    createdAt: Date.now(),
    isManager: false,
  },
];

export const Basic: Story = {
  args: {
    shop: mockShop,
    staffs: mockStaffs,
  },
};

export const Empty: Story = {
  args: {
    shop: mockShop,
    staffs: [],
  },
};

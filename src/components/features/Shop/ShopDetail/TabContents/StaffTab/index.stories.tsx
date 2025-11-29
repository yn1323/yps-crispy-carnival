import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffTab } from ".";

const meta: Meta<typeof StaffTab> = {
  component: StaffTab,
  title: "Features/Shop/ShopDetail/TabContents/StaffTab",
};

export default meta;

type Story = StoryObj<typeof StaffTab>;

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
    maxWeeklyHours: 40,
    createdAt: Date.now(),
    isManager: true,
  },
  {
    _id: "staff2" as Id<"staffs">,
    email: "sato@example.com",
    displayName: "佐藤花子",
    status: "active",
    skills: [{ position: "レジ", level: "研修中" }],
    maxWeeklyHours: 20,
    createdAt: Date.now(),
    isManager: false,
  },
  {
    _id: "staff3" as Id<"staffs">,
    email: "suzuki@example.com",
    displayName: "鈴木一郎",
    status: "pending",
    skills: [],
    maxWeeklyHours: undefined,
    createdAt: Date.now(),
    isManager: false,
  },
  {
    _id: "staff4" as Id<"staffs">,
    email: "tanaka@example.com",
    displayName: "田中美咲",
    status: "active",
    skills: [{ position: "ホール", level: "未経験" }],
    maxWeeklyHours: 15,
    createdAt: Date.now(),
    isManager: true,
  },
  {
    _id: "staff5" as Id<"staffs">,
    email: "takahashi@example.com",
    displayName: "高橋健太",
    status: "resigned",
    skills: [{ position: "キッチン", level: "ベテラン" }],
    maxWeeklyHours: 40,
    createdAt: Date.now(),
    isManager: false,
  },
];

export const Basic: Story = {
  args: {
    staffs: mockStaffs,
    canEdit: true,
  },
};

export const Empty: Story = {
  args: {
    staffs: [],
    canEdit: true,
  },
};

export const ReadOnly: Story = {
  args: {
    staffs: mockStaffs,
    canEdit: false,
  },
};

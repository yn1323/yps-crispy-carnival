import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffDetail, StaffDetailLoading, StaffDetailNotFound } from "./index";

const mockShop = {
  _id: "shop1" as Id<"shops">,
  shopName: "Crispy Carnival 本店",
};

const mockStaff = {
  _id: "staff1" as Id<"staffs">,
  email: "tanaka@example.com",
  displayName: "田中太郎",
  status: "active" as const,
  memo: "シフト調整に柔軟に対応してくれます。\n土日出勤可能。",
  workStyleNote: "午前中の勤務を希望。",
  resignedAt: undefined,
  resignationReason: undefined,
  createdAt: Date.now(),
  isManager: false,
};

const mockPositions = [
  { _id: "pos1" as Id<"shopPositions">, name: "ホール", order: 0 },
  { _id: "pos2" as Id<"shopPositions">, name: "キッチン", order: 1 },
  { _id: "pos3" as Id<"shopPositions">, name: "レジ", order: 2 },
  { _id: "pos4" as Id<"shopPositions">, name: "その他", order: 3 },
];

const mockStaffSkills = [
  {
    _id: "skill1" as Id<"staffSkills">,
    positionId: "pos1" as Id<"shopPositions">,
    positionName: "ホール",
    positionOrder: 0,
    level: "ベテラン",
  },
  {
    _id: "skill2" as Id<"staffSkills">,
    positionId: "pos2" as Id<"shopPositions">,
    positionName: "キッチン",
    positionOrder: 1,
    level: "研修中",
  },
  {
    _id: "skill3" as Id<"staffSkills">,
    positionId: "pos3" as Id<"shopPositions">,
    positionName: "レジ",
    positionOrder: 2,
    level: "未経験",
  },
  {
    _id: "skill4" as Id<"staffSkills">,
    positionId: "pos4" as Id<"shopPositions">,
    positionName: "その他",
    positionOrder: 3,
    level: "一人前",
  },
];

const meta = {
  title: "Features/Staff/StaffDetail",
  component: StaffDetail,
  args: {
    shop: mockShop,
    staff: mockStaff,
    positions: mockPositions,
    staffSkills: mockStaffSkills,
  },
} satisfies Meta<typeof StaffDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const AsManager: Story = {
  args: {
    staff: {
      ...mockStaff,
      isManager: true,
    },
  },
};

export const PendingStatus: Story = {
  args: {
    staff: {
      ...mockStaff,
      status: "pending" as const,
    },
    staffSkills: [], // 招待中はスキル未設定
  },
};

export const ResignedStatus: Story = {
  args: {
    staff: {
      ...mockStaff,
      status: "resigned" as const,
      resignedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      resignationReason: "転職のため",
    },
  },
};

export const Loading: Story = {
  render: () => <StaffDetailLoading />,
};

export const NotFound: Story = {
  render: () => <StaffDetailNotFound shopId="shop1" />,
};

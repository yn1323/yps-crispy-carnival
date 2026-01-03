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
  skills: [
    { position: "ホール", level: "ベテラン" },
    { position: "キッチン", level: "研修中" },
  ],
  maxWeeklyHours: 40,
  memo: "シフト調整に柔軟に対応してくれます。\n土日出勤可能。",
  workStyleNote: "午前中の勤務を希望。",
  hourlyWage: 1200,
  resignedAt: undefined,
  resignationReason: undefined,
  createdAt: Date.now(),
  isManager: false,
};

const meta = {
  title: "Features/Shop/StaffDetail",
  component: StaffDetail,
  args: {
    shop: mockShop,
    staff: mockStaff,
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
      skills: [],
      maxWeeklyHours: undefined,
    },
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

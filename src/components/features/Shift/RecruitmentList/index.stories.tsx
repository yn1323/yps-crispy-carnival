import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecruitmentList } from ".";

const meta: Meta<typeof RecruitmentList> = {
  component: RecruitmentList,
  title: "Features/Shift/RecruitmentList",
};

export default meta;

type Story = StoryObj<typeof RecruitmentList>;

const mockShop = {
  _id: "shop_1",
  shopName: "サンプル店舗",
};

const mockRecruitments = [
  {
    _id: "recruitment_1",
    startDate: "2025-12-01",
    endDate: "2025-12-07",
    deadline: "2025-11-25",
    status: "open" as const,
    appliedCount: 5,
    totalStaffCount: 8,
  },
  {
    _id: "recruitment_2",
    startDate: "2025-12-08",
    endDate: "2025-12-14",
    deadline: "2025-12-01",
    status: "closed" as const,
    appliedCount: 8,
    totalStaffCount: 8,
  },
  {
    _id: "recruitment_3",
    startDate: "2025-12-15",
    endDate: "2025-12-21",
    deadline: "2025-12-08",
    status: "confirmed" as const,
    appliedCount: 8,
    totalStaffCount: 8,
    confirmedAt: 1733788800000,
  },
];

export const Basic: Story = {
  args: {
    shop: mockShop,
    recruitments: mockRecruitments,
  },
};

export const Empty: Story = {
  args: {
    shop: mockShop,
    recruitments: [],
  },
};

export const OnlyOpen: Story = {
  args: {
    shop: mockShop,
    recruitments: [mockRecruitments[0]],
  },
};

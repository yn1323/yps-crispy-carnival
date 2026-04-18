import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments, mockStaffs } from "@/src/components/features/Dashboard/storyMocks";
import { DashboardContent2 } from ".";

const meta = {
  title: "Features/Dashboard2/DashboardContent",
  component: DashboardContent2,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DashboardContent2>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    shop: { name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" },
    recruitments: mockRecruitments,
    recruitmentStatus: "CanLoadMore",
    loadMoreRecruitments: () => {},
    staffs: mockStaffs,
    staffStatus: "Exhausted",
    loadMoreStaffs: () => {},
  },
};

export const Empty: Story = {
  args: {
    shop: { name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" },
    recruitments: [],
    recruitmentStatus: "Exhausted",
    loadMoreRecruitments: () => {},
    staffs: [],
    staffStatus: "Exhausted",
    loadMoreStaffs: () => {},
  },
};

export const Setup: Story = {
  args: {
    shop: null,
    recruitments: [],
    recruitmentStatus: "Exhausted",
    loadMoreRecruitments: () => {},
    staffs: [],
    staffStatus: "Exhausted",
    loadMoreStaffs: () => {},
  },
};

export const SP: Story = {
  args: Normal.args,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

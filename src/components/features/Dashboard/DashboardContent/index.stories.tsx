import type { Meta, StoryObj } from "@storybook/react-vite";
import { mockRecruitments, mockStaffs } from "../storyMocks";
import { DashboardContent } from "./index";

const meta = {
  title: "Features/Dashboard/DashboardContent",
  component: DashboardContent,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof DashboardContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  args: {
    shop: { name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" },
    recruitments: mockRecruitments,
    recruitmentStatus: "CanLoadMore",
    loadMoreRecruitments: () => {},
    staffs: mockStaffs,
    staffStatus: "CanLoadMore",
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

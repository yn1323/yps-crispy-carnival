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
    managerLegalConsentStatus: {
      required: false,
      documents: {
        terms: { title: "管理ユーザー向け利用規約", path: "/terms/manager" },
        privacy: { title: "管理ユーザー向けプライバシーポリシー", path: "/privacy/manager" },
      },
    },
    recruitments: mockRecruitments,
    recruitmentStatus: "CanLoadMore",
    canLoadMoreRecruitments: true,
    loadMoreRecruitments: () => {},
    staffs: mockStaffs,
    staffStatus: "CanLoadMore",
    canLoadMoreStaffs: true,
    loadMoreStaffs: () => {},
  },
};

export const LegalReconsentRequired: Story = {
  args: {
    ...Normal.args,
    managerLegalConsentStatus: {
      required: true,
      documents: {
        terms: { title: "管理ユーザー向け利用規約", path: "/terms/manager" },
        privacy: { title: "管理ユーザー向けプライバシーポリシー", path: "/privacy/manager" },
      },
    },
  },
};

export const Empty: Story = {
  args: {
    shop: { name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" },
    recruitments: [],
    recruitmentStatus: "Exhausted",
    canLoadMoreRecruitments: false,
    loadMoreRecruitments: () => {},
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: () => {},
  },
};

export const Setup: Story = {
  args: {
    shop: null,
    recruitments: [],
    recruitmentStatus: "Exhausted",
    canLoadMoreRecruitments: false,
    loadMoreRecruitments: () => {},
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: () => {},
  },
};

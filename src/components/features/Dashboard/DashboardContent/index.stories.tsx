import type { Meta, StoryObj } from "@storybook/react-vite";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
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
    managerLegalConsentStatus: {
      required: false,
      documents: {
        terms: { title: "管理ユーザー向け利用規約", path: "/terms/manager" },
        privacy: { title: "管理ユーザー向けプライバシーポリシー", path: "/privacy/manager" },
      },
    },
    recruitments: [],
    recruitmentStatus: "Exhausted",
    canLoadMoreRecruitments: false,
    loadMoreRecruitments: () => {},
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: () => {},
    ownerProfileDefaults: {
      name: "山田 太郎",
      email: "yamada@example.com",
    },
  },
  play: async ({ canvasElement }) => {
    const startButton = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("ガイド"),
    );
    startButton?.click();

    const startedAt = performance.now();
    while (performance.now() - startedAt < 2000) {
      const spotlight = document.querySelector(".react-joyride__spotlight");
      if (spotlight) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (!document.querySelector(".react-joyride__spotlight")) {
      throw new Error("Dashboard onboarding tour spotlight が表示されませんでした");
    }

    canvasElement.querySelector<HTMLButtonElement>(`[data-tour="${DASHBOARD_TOUR_TARGET.createRecruitment}"]`)?.click();

    const clickedAt = performance.now();
    while (performance.now() - clickedAt < 2000) {
      const spotlight = document.querySelector(".react-joyride__spotlight");
      if (!spotlight) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error("Tour対象を押下しても spotlight が非表示になりませんでした");
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

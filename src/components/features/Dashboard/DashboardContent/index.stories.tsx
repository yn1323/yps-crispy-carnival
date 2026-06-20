import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { mockCurrentRecruitments, mockRecruitments, mockStaffs } from "../storyMocks";
import {
  buildDashboardRecruitmentGroups,
  type DashboardAnnouncement,
  type Recruitment,
  type Staff,
  type StaffRegistrationRequest,
} from "../types";
import { DashboardContent, DashboardContentSkeleton } from "./index";

const noop = () => {};

const shop = {
  name: "居酒屋たなか",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "14:00", endTime: "25:00" },
};
const managerLegalConsentReady = {
  required: false,
  documents: {
    terms: { title: "管理ユーザー向け利用規約", path: "/terms/manager" },
    privacy: { title: "管理ユーザー向けプライバシーポリシー", path: "/privacy/manager" },
  },
};

const managerOnly = [
  {
    _id: "staff-manager",
    name: "田中太郎",
    email: "tanaka@example.com",
    isManager: true,
    isLineLinked: true,
    isLineFollowing: true,
  },
] as unknown as Staff[];

const managerAndStaff = [
  ...managerOnly,
  {
    _id: "staff-2",
    name: "佐藤花子",
    email: "sato@example.com",
    isManager: false,
    isLineLinked: false,
    isLineFollowing: false,
  },
] as unknown as Staff[];

const pendingStaffRequests = [
  {
    _id: "staff-registration-request-1",
    name: "田中 花子",
    email: "hanako@example.com",
    createdAt: Date.now(),
  },
  {
    _id: "staff-registration-request-2",
    name: "佐藤 太郎",
    email: "taro@example.com",
    createdAt: Date.now(),
  },
] as unknown as StaffRegistrationRequest[];

const dashboardAnnouncement = {
  _id: "dashboard-announcement-1",
  title: "LINE通知の遅延について",
  bodyHtml: "<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p>",
  displayDate: "2026-06-17",
} as unknown as DashboardAnnouncement;
const dashboardRecruitments = mockRecruitments;
const dashboardRecruitmentGroups = buildDashboardRecruitmentGroups({ recruitments: dashboardRecruitments }).groups;

const onboardingRecruitment = (overrides: Partial<Recruitment> = {}) =>
  ({
    _id: "rec-onboarding",
    createdAt: 1_781_160_800_000,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-07",
    deadline: "2026-05-28",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 0,
    totalStaffCount: 1,
    ...overrides,
  }) as unknown as Recruitment;

const dashboardBaseArgs = {
  shop,
  managerLegalConsentStatus: managerLegalConsentReady,
  recruitmentStatus: "Exhausted",
  hasPastRecruitments: false,
  isPastRecruitmentsVisible: false,
  pastRecruitmentStatus: "Exhausted",
  canLoadMorePastRecruitments: false,
  showPastRecruitments: noop,
  loadMorePastRecruitments: noop,
  staffStatus: "Exhausted",
  canLoadMoreStaffs: false,
  loadMoreStaffs: noop,
} satisfies Pick<
  ComponentProps<typeof DashboardContent>,
  | "shop"
  | "managerLegalConsentStatus"
  | "recruitmentStatus"
  | "hasPastRecruitments"
  | "isPastRecruitmentsVisible"
  | "pastRecruitmentStatus"
  | "canLoadMorePastRecruitments"
  | "showPastRecruitments"
  | "loadMorePastRecruitments"
  | "staffStatus"
  | "canLoadMoreStaffs"
  | "loadMoreStaffs"
>;

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
    shop,
    managerLegalConsentStatus: managerLegalConsentReady,
    recruitments: dashboardRecruitments,
    recruitmentGroups: dashboardRecruitmentGroups,
    currentRecruitments: mockCurrentRecruitments,
    recruitmentStatus: "Exhausted",
    hasPastRecruitments: true,
    isPastRecruitmentsVisible: false,
    pastRecruitmentStatus: "Exhausted",
    canLoadMorePastRecruitments: false,
    showPastRecruitments: noop,
    loadMorePastRecruitments: noop,
    staffs: mockStaffs,
    staffStatus: "CanLoadMore",
    canLoadMoreStaffs: true,
    loadMoreStaffs: noop,
  },
};

export const WithAnnouncement: Story = {
  args: {
    ...Normal.args,
    announcement: dashboardAnnouncement,
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

export const Loading: Story = {
  args: {
    ...Normal.args,
  },
  render: () => (
    <Box minH="100vh" bg="white" p={{ base: 4, lg: 8 }}>
      <DashboardContentSkeleton />
    </Box>
  ),
};

export const Empty: Story = {
  args: {
    shop,
    managerLegalConsentStatus: managerLegalConsentReady,
    recruitments: [],
    currentRecruitments: [],
    recruitmentStatus: "Exhausted",
    hasPastRecruitments: false,
    isPastRecruitmentsVisible: false,
    pastRecruitmentStatus: "Exhausted",
    canLoadMorePastRecruitments: false,
    showPastRecruitments: noop,
    loadMorePastRecruitments: noop,
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: noop,
    managerProfileDefaults: {
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

const onboardingPlay =
  (label: string, expectedProgress: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    assertText(canvasElement, "シフトリへようこそ！", `${label} のオンボーディング見出し`);
    assertText(canvasElement, expectedProgress, `${label} の進捗表示`);
  };

export const OnboardingBeforeRecruitment: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    currentRecruitments: [],
    staffs: managerOnly,
  },
  play: onboardingPlay("1/4 募集作成前", "1/4"),
};

export const OnboardingAfterRecruitmentCreated: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment()],
    currentRecruitments: [],
    staffs: managerOnly,
  },
  play: onboardingPlay("2/4 募集作成後", "2/4"),
};

export const OnboardingAfterSubmission: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment({ responseCount: 1 })],
    currentRecruitments: [],
    staffs: managerOnly,
  },
  play: onboardingPlay("3/4 提出後", "3/4"),
};

export const OnboardingAfterShiftConfirmed: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment({ status: "confirmed", responseCount: 1 })],
    currentRecruitments: [],
    staffs: managerOnly,
  },
  play: onboardingPlay("4/4 シフト確認後", "4/4"),
};

export const OnboardingStaffAdded: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment({ status: "confirmed", responseCount: 1 })],
    currentRecruitments: [],
    staffs: managerAndStaff,
  },
  play: onboardingPlay("4/4 スタッフ追加済み", "4/4"),
};

export const DismissedOnboardingShowsNextAction: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    staffs: managerOnly,
  },
  render: () => (
    <Box data-testid="onboarding-dismissal-root" minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <DashboardContent {...dashboardBaseArgs} recruitments={[]} staffs={managerOnly} />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const root = requireElement(canvasElement, '[data-testid="onboarding-dismissal-root"]');
    assertText(root, "シフトリへようこそ！", "閉じる前のオンボーディング見出し");
    assertText(root, "1/4", "閉じる前の進捗表示");
    assertNoText(root, "今やること", "閉じる前の通常アクション非表示");

    requireElement<HTMLButtonElement>(root, 'button[aria-label="シフトリへようこそを閉じる"]').click();

    await waitUntil(
      () => root.textContent?.includes("今やること") ?? false,
      "閉じた後に今やることが表示されませんでした",
    );

    assertText(root, "今やること", "閉じた後の通常アクション見出し");
    assertNoText(root, "シフトリへようこそ！", "閉じた後のオンボーディング非表示");
  },
};

export const PendingRequestsShowNextActionDuringOnboarding: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    staffs: managerOnly,
    pendingStaffRequests,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: () => (
    <Box data-testid="pending-requests-onboarding-root" minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <DashboardContent
        {...dashboardBaseArgs}
        recruitments={[]}
        currentRecruitments={[]}
        staffs={managerOnly}
        pendingStaffRequests={pendingStaffRequests}
      />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const root = requireElement(canvasElement, '[data-testid="pending-requests-onboarding-root"]');
    await waitUntil(() => root.textContent?.includes("今やること") ?? false, "今やることが表示されませんでした");

    assertText(root, "今やること", "承認待ちがある時の通常アクション見出し");
    assertText(root, "スタッフ参加申請が 2 件あります", "承認待ちカードの見出し");
    assertText(root, "確認する", "承認待ちカードのCTA");
    assertNoText(root, "田中 花子", "カード表示時は申請者名を隠す");
    assertNoText(root, "hanako@example.com", "カード表示時は申請者メールを隠す");
    assertNoText(root, "シフトリへようこそ！", "承認待ちがある時のオンボーディング非表示");

    const confirmButton = findButtonByText(root, "確認する");
    confirmButton.click();

    await waitUntil(
      () => document.body.textContent?.includes("承認してシフト提出、共有できるようにしましょう。") ?? false,
      "スタッフ参加申請モーダルが表示されませんでした",
    );
    assertText(document.body, "田中 花子", "モーダル内の承認待ちスタッフ名");
    assertText(document.body, "hanako@example.com", "モーダル内の承認待ちスタッフメール");
    assertText(document.body, "承認", "モーダル内の承認ボタン");
    assertText(document.body, "却下", "モーダル内の却下ボタン");
  },
};

export const Setup: Story = {
  args: {
    shop: null,
    recruitments: [],
    currentRecruitments: [],
    recruitmentStatus: "Exhausted",
    hasPastRecruitments: false,
    isPastRecruitmentsVisible: false,
    pastRecruitmentStatus: "Exhausted",
    canLoadMorePastRecruitments: false,
    showPastRecruitments: noop,
    loadMorePastRecruitments: noop,
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: noop,
  },
};

export const SetupWithAnnouncement: Story = {
  args: {
    ...Setup.args,
    announcement: dashboardAnnouncement,
  },
};

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`${selector} が見つかりませんでした`);
  }
  return element;
}

function assertText(root: Element, text: string, context: string) {
  if (!root.textContent?.includes(text)) {
    throw new Error(`${context}: "${text}" が表示されませんでした`);
  }
}

function assertNoText(root: Element, text: string, context: string) {
  if (root.textContent?.includes(text)) {
    throw new Error(`${context}: "${text}" が表示されています`);
  }
}

function findButtonByText(root: Element, text: string) {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`button "${text}" が見つかりませんでした`);
  }
  return button;
}

async function waitUntil(predicate: () => boolean, failureMessage: string) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 2000) {
    if (predicate()) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(failureMessage);
}

import { Box, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { DASHBOARD_TOUR_TARGET } from "../dashboardTourTargets";
import { mockRecruitments, mockStaffs } from "../storyMocks";
import type { Recruitment, Staff, StaffRegistrationRequest } from "../types";
import { DashboardContent } from "./index";

const noop = () => {};

const shop = { name: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" };
const managerLegalConsentReady = {
  required: false,
  documents: {
    terms: { title: "管理ユーザー向け利用規約", path: "/terms/manager" },
    privacy: { title: "管理ユーザー向けプライバシーポリシー", path: "/privacy/manager" },
  },
};

const ownerOnly = [
  {
    _id: "staff-owner",
    name: "田中太郎",
    email: "tanaka@example.com",
    isOwner: true,
    isLineLinked: true,
    isLineFollowing: true,
  },
] as unknown as Staff[];

const ownerAndStaff = [
  ...ownerOnly,
  {
    _id: "staff-2",
    name: "佐藤花子",
    email: "sato@example.com",
    isOwner: false,
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

const onboardingRecruitment = (overrides: Partial<Recruitment> = {}) =>
  ({
    _id: "rec-onboarding",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-07",
    deadline: "2026-05-28",
    status: "open",
    responseCount: 0,
    ...overrides,
  }) as unknown as Recruitment;

const dashboardBaseArgs = {
  shop,
  managerLegalConsentStatus: managerLegalConsentReady,
  recruitmentStatus: "Exhausted",
  canLoadMoreRecruitments: false,
  loadMoreRecruitments: noop,
  staffStatus: "Exhausted",
  canLoadMoreStaffs: false,
  loadMoreStaffs: noop,
} satisfies Pick<
  ComponentProps<typeof DashboardContent>,
  | "shop"
  | "managerLegalConsentStatus"
  | "recruitmentStatus"
  | "canLoadMoreRecruitments"
  | "loadMoreRecruitments"
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
    recruitments: mockRecruitments,
    recruitmentStatus: "CanLoadMore",
    canLoadMoreRecruitments: true,
    loadMoreRecruitments: noop,
    staffs: mockStaffs,
    staffStatus: "CanLoadMore",
    canLoadMoreStaffs: true,
    loadMoreStaffs: noop,
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
    shop,
    managerLegalConsentStatus: managerLegalConsentReady,
    recruitments: [],
    recruitmentStatus: "Exhausted",
    canLoadMoreRecruitments: false,
    loadMoreRecruitments: noop,
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: noop,
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

const onboardingFlowVariants = [
  {
    id: "step-1",
    label: "1/4 募集作成前",
    recruitments: [],
    staffs: ownerOnly,
    expectedProgress: "1/4",
  },
  {
    id: "step-2",
    label: "2/4 募集作成後",
    recruitments: [onboardingRecruitment()],
    staffs: ownerOnly,
    expectedProgress: "2/4",
  },
  {
    id: "step-3",
    label: "3/4 提出後",
    recruitments: [onboardingRecruitment({ responseCount: 1 })],
    staffs: ownerOnly,
    expectedProgress: "3/4",
  },
  {
    id: "step-4",
    label: "4/4 シフト確認後",
    recruitments: [onboardingRecruitment({ status: "confirmed", responseCount: 1 })],
    staffs: ownerOnly,
    expectedProgress: "4/4",
  },
  {
    id: "done",
    label: "4/4 スタッフ追加済み",
    recruitments: [onboardingRecruitment({ status: "confirmed", responseCount: 1 })],
    staffs: ownerAndStaff,
    expectedProgress: "4/4",
  },
] satisfies Array<{
  id: string;
  label: string;
  recruitments: Recruitment[];
  staffs: Staff[];
  expectedProgress: string | null;
}>;

export const OnboardingFlowStates: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    staffs: ownerOnly,
  },
  render: () => (
    <Box minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <Stack maxW="1040px" mx="auto" gap={{ base: 6, md: 8 }}>
        {onboardingFlowVariants.map((variant) => (
          <Stack key={variant.id} data-testid={`onboarding-flow-${variant.id}`} gap={3}>
            <Text fontSize="xs" fontWeight="semibold" color="fg.muted" letterSpacing="0.08em" textTransform="uppercase">
              {variant.label}
            </Text>
            <DashboardContent {...dashboardBaseArgs} recruitments={variant.recruitments} staffs={variant.staffs} />
          </Stack>
        ))}
      </Stack>
    </Box>
  ),
  play: async ({ canvasElement }) => {
    for (const variant of onboardingFlowVariants) {
      const section = requireElement(canvasElement, `[data-testid="onboarding-flow-${variant.id}"]`);
      if (variant.expectedProgress) {
        assertText(section, "シフトリへようこそ！", `${variant.label} のオンボーディング見出し`);
        assertText(section, variant.expectedProgress, `${variant.label} の進捗表示`);
        continue;
      }

      assertText(section, "今やること", `${variant.label} の通常アクション見出し`);
      assertNoText(section, "シフトリへようこそ！", `${variant.label} のオンボーディング非表示`);
    }
  },
};

export const DismissedOnboardingShowsNextAction: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    staffs: ownerOnly,
  },
  render: () => (
    <Box data-testid="onboarding-dismissal-root" minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <DashboardContent {...dashboardBaseArgs} recruitments={[]} staffs={ownerOnly} />
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
    staffs: ownerOnly,
    pendingStaffRequests,
  },
  render: () => (
    <Box data-testid="pending-requests-onboarding-root" minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <DashboardContent
        {...dashboardBaseArgs}
        recruitments={[]}
        staffs={ownerOnly}
        pendingStaffRequests={pendingStaffRequests}
      />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const root = requireElement(canvasElement, '[data-testid="pending-requests-onboarding-root"]');
    await waitUntil(() => root.textContent?.includes("今やること") ?? false, "今やることが表示されませんでした");

    assertText(root, "今やること", "承認待ちがある時の通常アクション見出し");
    assertText(root, "スタッフ参加申請", "承認待ちリストの見出し");
    assertText(root, "田中 花子", "承認待ちスタッフ名");
    assertText(root, "hanako@example.com", "承認待ちスタッフメール");
    assertNoText(root, "シフトリへようこそ！", "承認待ちがある時のオンボーディング非表示");
  },
};

export const Setup: Story = {
  args: {
    shop: null,
    recruitments: [],
    recruitmentStatus: "Exhausted",
    canLoadMoreRecruitments: false,
    loadMoreRecruitments: noop,
    staffs: [],
    staffStatus: "Exhausted",
    canLoadMoreStaffs: false,
    loadMoreStaffs: noop,
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

async function waitUntil(predicate: () => boolean, failureMessage: string) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 2000) {
    if (predicate()) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(failureMessage);
}

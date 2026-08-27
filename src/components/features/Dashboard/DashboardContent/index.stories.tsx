import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import dayjs from "dayjs";
import { createStore, Provider } from "jotai";
import { type ComponentProps, type ReactNode, useState } from "react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { userAtom } from "@/src/stores/user";
import type { DashboardNotificationFailure } from "../NotificationFailureRecovery";
import type { OperationContextData } from "../OperationContext";
import { buildDashboardRecruitmentGroups } from "../script";
import { mockCurrentRecruitments, mockRecruitments, mockStaffs } from "../stories/fixtures";
import type { DashboardAnnouncement, Recruitment, Staff, StaffRegistrationRequest } from "../types";
import { DashboardContent, DashboardContentSkeleton } from "./index";

const noop = () => {};

const shop = {
  name: "居酒屋たなか",
  regularClosedDays: [],
  submissionPattern: { kind: "time" as const, startTime: "14:00", endTime: "25:00" },
};
const operationShop = {
  shopId: "shop-1",
  shopName: shop.name,
  shopStatus: "active" as const,
  organizationId: "organization-1",
  organizationName: "たなかグループ",
  organizationPlan: "standard" as const,
};
const operationContextData = {
  shops: [
    operationShop,
    {
      ...operationShop,
      shopId: "shop-2",
      shopName: "カフェたなか",
    },
  ],
  selectedShop: operationShop,
  onSelect: noop,
} satisfies OperationContextData;
const singleShopOperationContextData = {
  shops: [operationShop],
  selectedShop: operationShop,
  onSelect: noop,
} satisfies OperationContextData;
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
    organizationPersonId: "person-manager",
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
    organizationPersonId: "person-2",
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
    canApprove: true,
    approveDisabledReason: null,
  },
  {
    _id: "staff-registration-request-2",
    name: "佐藤 太郎",
    email: "taro@example.com",
    createdAt: Date.now(),
    canApprove: true,
    approveDisabledReason: null,
  },
] as unknown as StaffRegistrationRequest[];

const dashboardAnnouncement = {
  _id: "dashboard-announcement-1",
  title: "LINE通知の遅延について",
  bodyHtml: "<p>現在、LINE通知の送信に遅延が発生しています。</p><p>復旧までメール通知をご確認ください。</p>",
  displayDate: "2026-06-17",
} as unknown as DashboardAnnouncement;
const notificationFailures = [
  {
    _id: "notification-failure-1",
    staffName: "佐藤 真由美",
    notificationKind: "recruitment",
    notificationKindLabel: "シフト募集通知",
    periodLabel: "7/1〜7/15",
    channel: "email",
    lastFailedAt: new Date("2026-06-22T05:23:00.000Z").getTime(),
    canRetry: true,
  },
  {
    _id: "notification-failure-2",
    staffName: "高橋 健太",
    notificationKind: "reminder",
    notificationKindLabel: "催促用リンク",
    periodLabel: "7/1〜7/15",
    channel: "line",
    lastFailedAt: new Date("2026-06-22T04:58:00.000Z").getTime(),
    canRetry: true,
  },
] as unknown as DashboardNotificationFailure[];
// 日付が進んでもVRTの表示状態が変わらないよう、期間は将来に固定し、提出期限の表示だけを「今日」に保つ。
const dashboardStoryToday = dayjs().format("YYYY-MM-DD");
const dashboardRecruitments = [
  {
    ...mockCurrentRecruitments[0],
    periodStart: "2099-01-01",
    periodEnd: "2099-01-15",
    deadline: "2098-12-20",
  },
  {
    ...mockRecruitments[0],
    periodStart: "2099-02-01",
    periodEnd: "2099-02-15",
    deadline: dashboardStoryToday,
  },
  {
    ...mockRecruitments[1],
    periodStart: "2099-03-01",
    periodEnd: "2099-03-15",
    deadline: dashboardStoryToday,
  },
] satisfies Recruitment[];
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
  operationContextData,
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
  | "operationContextData"
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

const singleShopDashboardArgs = {
  ...dashboardBaseArgs,
  operationContextData: singleShopOperationContextData,
  recruitments: dashboardRecruitments,
  recruitmentGroups: dashboardRecruitmentGroups,
  currentRecruitments: [dashboardRecruitments[0]],
  hasPastRecruitments: false,
  staffs: mockStaffs,
  staffStatus: "Exhausted",
  canLoadMoreStaffs: false,
  isDashboardOnboardingDismissed: true,
} satisfies ComponentProps<typeof DashboardContent>;

const singleShopStoryStore = createStore();
singleShopStoryStore.set(userAtom, {
  authId: "dashboard-story-user",
  name: "田中太郎",
  email: "tanaka@example.com",
});

function DashboardPagePreview({ children }: { children: ReactNode }) {
  return (
    <Provider store={singleShopStoryStore}>
      <Box minH="100vh" bg="gray.50">
        <RootContentWrapper>{children}</RootContentWrapper>
      </Box>
    </Provider>
  );
}

function DashboardAppShellPreview({ children }: { children: ReactNode }) {
  return (
    <Provider store={singleShopStoryStore}>
      <AuthenticatedAppShell activeKey="home" activeOrganizationId="organization-1">
        <AuthenticatedPageContent includeMobileNavigation>{children}</AuthenticatedPageContent>
      </AuthenticatedAppShell>
    </Provider>
  );
}

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
    operationContextData,
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

export const MultiShopMobile: Story = {
  ...Normal,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SingleShop: Story = {
  args: singleShopDashboardArgs,
  render: (args) => (
    <DashboardPagePreview>
      <DashboardContent {...args} />
    </DashboardPagePreview>
  ),
};

export const SingleShopMobile: Story = {
  ...SingleShop,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const HomeAppCompositionDesktop: Story = {
  name: "ホーム・新shell・デスクトップ",
  args: singleShopDashboardArgs,
  parameters: { vrt: { releaseFixedHeader: true } },
  render: (args) => (
    <DashboardAppShellPreview>
      <DashboardContent {...args} />
    </DashboardAppShellPreview>
  ),
};

export const HomeAppCompositionMobile: Story = {
  ...HomeAppCompositionDesktop,
  name: "ホーム・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const ReadOnlyShop: Story = {
  args: {
    ...Normal.args,
    isReadOnly: true,
    isDashboardOnboardingDismissed: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "店舗詳細を開く" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "新しい募集をつくる" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "スタッフを追加する" })).toBeDisabled();
  },
};

export const ReadOnlyShopMobile: Story = {
  ...ReadOnlyShop,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const ReadOnlyTransitionBehavior: Story = {
  args: Normal.args,
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <ReadOnlyTransitionStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const toggle = canvas.getByRole("button", { name: "閲覧専用を切り替える" });

    const expectDialogClosedByReadOnly = async (dialogName: string) => {
      fireEvent.click(toggle);
      await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
      await waitFor(() => expect(body.queryByRole("dialog", { name: dialogName })).not.toBeInTheDocument());
      fireEvent.click(toggle);
      await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));
    };

    await userEvent.click(await canvas.findByRole("button", { name: "新しい募集をつくる" }));
    await body.findByRole("dialog", { name: "新しい募集をつくる" });
    await expectDialogClosedByReadOnly("新しい募集をつくる");

    await userEvent.click(await canvas.findByRole("button", { name: "スタッフを追加する" }));
    await body.findByRole("dialog", { name: "スタッフを追加" });
    await expectDialogClosedByReadOnly("スタッフを追加");

    await userEvent.click(await canvas.findByRole("button", { name: /スタッフ登録申請が2件/ }));
    await canvas.findByRole("region", { name: "スタッフ登録申請" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(canvas.queryByRole("region", { name: "スタッフ登録申請" })).not.toBeInTheDocument());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "false"));

    await userEvent.click(await canvas.findByRole("button", { name: /送れなかった通知が2件/ }));
    await canvas.findByRole("region", { name: "送れなかった通知" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(canvas.queryByRole("region", { name: "送れなかった通知" })).not.toBeInTheDocument());
  },
};

function ReadOnlyTransitionStory() {
  const [isReadOnly, setIsReadOnly] = useState(false);

  return (
    <>
      <Button
        aria-label="閲覧専用を切り替える"
        aria-pressed={isReadOnly}
        position="fixed"
        top={2}
        left={2}
        zIndex="tooltip"
        onClick={() => setIsReadOnly((current) => !current)}
      >
        閲覧専用を切り替える
      </Button>
      <DashboardContent
        {...dashboardBaseArgs}
        isReadOnly={isReadOnly}
        recruitments={dashboardRecruitments}
        recruitmentGroups={dashboardRecruitmentGroups}
        currentRecruitments={mockCurrentRecruitments}
        staffs={mockStaffs}
        pendingStaffRequests={pendingStaffRequests}
        notificationFailures={notificationFailures}
        isDashboardOnboardingDismissed
      />
    </>
  );
}

export const WithAnnouncement: Story = {
  args: {
    ...Normal.args,
    announcement: dashboardAnnouncement,
  },
};

export const WithNotificationFailures: Story = {
  args: {
    ...Normal.args,
    notificationFailures,
    isDashboardOnboardingDismissed: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("region", { name: "送れなかった通知" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /送れなかった通知が2件/ }));

    const notificationItems = await canvas.findByRole("region", { name: "送れなかった通知" });
    await waitFor(() => expect(within(notificationItems).getByText(/佐藤 真由美さんへシフト募集通知/)).toBeVisible());
    await expect(within(notificationItems).getAllByRole("button", { name: "再送する" }).length).toBeGreaterThan(0);

    await userEvent.click(canvas.getByRole("button", { name: /送れなかった通知が2件/ }));
    await waitFor(() => expect(canvas.queryByRole("region", { name: "送れなかった通知" })).not.toBeInTheDocument());
  },
};

export const MultipleOperationalTodoPanelsBehavior: Story = {
  args: {
    ...Normal.args,
    pendingStaffRequests,
    notificationFailures,
    isDashboardOnboardingDismissed: true,
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.queryByRole("region", { name: "送れなかった通知" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "スタッフ登録申請" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: /送れなかった通知が2件/ }));
    await userEvent.click(canvas.getByRole("button", { name: /スタッフ登録申請が2件/ }));

    const notificationItems = await canvas.findByRole("region", { name: "送れなかった通知" });
    const registrationItems = await canvas.findByRole("region", { name: "スタッフ登録申請" });
    await waitFor(() =>
      expect(within(notificationItems).getAllByRole("button", { name: "再送する" })[0]).toBeVisible(),
    );
    await waitFor(() =>
      expect(within(registrationItems).getAllByRole("button", { name: "承認する" })[0]).toBeVisible(),
    );

    await userEvent.click(canvas.getByRole("button", { name: /送れなかった通知が2件/ }));
    await waitFor(() => expect(canvas.queryByRole("region", { name: "送れなかった通知" })).not.toBeInTheDocument());
    await expect(canvas.getByRole("region", { name: "スタッフ登録申請" })).toBeVisible();
  },
};

const expandedOperationalTodoPanelsArgs = {
  ...Normal.args,
  pendingStaffRequests,
  notificationFailures,
  isDashboardOnboardingDismissed: true,
};

const expandOperationalTodoPanels = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: /送れなかった通知が2件/ }));
  await userEvent.click(canvas.getByRole("button", { name: /スタッフ登録申請が2件/ }));
  await canvas.findByRole("region", { name: "送れなかった通知" });
  await canvas.findByRole("region", { name: "スタッフ登録申請" });
};

export const ExpandedOperationalTodoPanelsDesktop: Story = {
  args: expandedOperationalTodoPanelsArgs,
  play: async ({ canvasElement }) => expandOperationalTodoPanels(canvasElement),
};

export const ExpandedOperationalTodoPanelsMobile: Story = {
  args: expandedOperationalTodoPanelsArgs,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => expandOperationalTodoPanels(canvasElement),
};

export const OperationalTodoConfirmationFocusBehavior: Story = {
  args: expandedOperationalTodoPanelsArgs,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: /スタッフ登録申請が2件/ }));
    const registrationItems = await canvas.findByRole("region", { name: "スタッフ登録申請" });
    const trigger = within(registrationItems).getAllByRole("button", { name: /その他の操作$/ })[0];
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole("menuitem", { name: "却下する" }));

    const dialog = await body.findByRole("alertdialog", { name: "スタッフ登録申請を却下しますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "やめる" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const OperationalTodoScopeResetBehavior: Story = {
  args: Normal.args,
  parameters: { screenshot: { skip: true } },
  render: () => <OperationalTodoScopeResetStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: /送れなかった通知が2件/ }));
    await userEvent.click(canvas.getByRole("button", { name: /スタッフ登録申請が2件/ }));
    await canvas.findByRole("region", { name: "送れなかった通知" });
    await canvas.findByRole("region", { name: "スタッフ登録申請" });

    await userEvent.click(canvas.getByRole("button", { name: "操作店舗を切り替える" }));

    await waitFor(() => expect(canvas.queryByRole("region", { name: "送れなかった通知" })).not.toBeInTheDocument());
    await expect(canvas.queryByRole("region", { name: "スタッフ登録申請" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "カフェたなか", level: 1 })).toBeVisible();
  },
};

function OperationalTodoScopeResetStory() {
  const [selectedShopIndex, setSelectedShopIndex] = useState(0);
  const selectedShop = operationContextData.shops[selectedShopIndex] ?? operationShop;
  const selectedOperationContext = {
    ...operationContextData,
    selectedShop,
  } satisfies OperationContextData;

  return (
    <>
      <Button
        position="fixed"
        top={2}
        left={2}
        zIndex="tooltip"
        onClick={() => setSelectedShopIndex((current) => (current === 0 ? 1 : 0))}
      >
        操作店舗を切り替える
      </Button>
      <DashboardContent
        {...dashboardBaseArgs}
        operationContextData={selectedOperationContext}
        recruitments={dashboardRecruitments}
        currentRecruitments={mockCurrentRecruitments}
        staffs={mockStaffs}
        pendingStaffRequests={pendingStaffRequests}
        notificationFailures={notificationFailures}
        isDashboardOnboardingDismissed
      />
    </>
  );
}

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
  args: singleShopDashboardArgs,
  render: () => (
    <DashboardPagePreview>
      <DashboardContentSkeleton />
    </DashboardPagePreview>
  ),
};

export const LoadingMobile: Story = {
  ...Loading,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const StaffLoadingKeepsPrimaryContentBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    ...Normal.args,
    staffs: [],
    staffStatus: "LoadingFirstPage",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByLabelText("シフト一覧")).toBeInTheDocument();
    await expect(canvas.queryByLabelText("シフト一覧を読み込み中")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("スタッフ一覧を読み込み中")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "新しい募集をつくる" })).toBeEnabled();
  },
};

export const Empty: Story = {
  args: {
    shop,
    operationContextData,
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
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "ガイド" }));
    await waitFor(() => expect(document.querySelector(".react-joyride__spotlight")).toBeInTheDocument());

    await userEvent.click(canvas.getByRole("button", { name: "新しい募集をつくる" }));
    await waitFor(() => expect(document.querySelector(".react-joyride__spotlight")).not.toBeInTheDocument());

    const dialog = await body.findByRole("dialog", { name: "新しい募集をつくる" });
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "新しい募集をつくる" })).not.toBeInTheDocument());
  },
};

export const RecruitmentCreateReopenResetsBehavior: Story = {
  args: Empty.args,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const periodStart = dayjs().add(2, "day");
    const periodEnd = dayjs().add(4, "day");

    await userEvent.click(canvas.getByRole("button", { name: "新しい募集をつくる" }));
    const dialog = await body.findByRole("dialog", { name: "新しい募集をつくる" });
    const dialogView = within(dialog);

    for (const date of [periodStart, periodEnd]) {
      const iso = date.format("YYYY-MM-DD");
      const dateButton = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>('[data-part="table-cell-trigger"]'),
      ).find((button) => Array.from(button.attributes).some((attribute) => attribute.value.includes(iso)));
      expect(dateButton, `${iso} の日付ボタン`).toBeDefined();
      await userEvent.click(dateButton as HTMLButtonElement);
    }

    await userEvent.click(dialogView.getByRole("button", { name: "次へ" }));
    await dialogView.findByText("定休日を選択(任意)");
    await userEvent.click(dialogView.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "新しい募集をつくる" })).not.toBeInTheDocument());

    await userEvent.click(canvas.getByRole("button", { name: "新しい募集をつくる" }));
    const reopenedDialog = await body.findByRole("dialog", { name: "新しい募集をつくる" });
    const reopenedView = within(reopenedDialog);
    await expect(reopenedView.getByText("シフト期間を選択")).toBeInTheDocument();
    await expect(reopenedDialog.querySelector('input[name="periodStart"]')).toHaveValue("");
    await expect(reopenedDialog.querySelector('input[name="periodEnd"]')).toHaveValue("");
    await expect(reopenedDialog.querySelector("[data-selected]")).not.toBeInTheDocument();
  },
};

export const OnboardingBeforeRecruitment: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    currentRecruitments: [],
    staffs: managerOnly,
  },
};

export const OnboardingAfterRecruitmentCreated: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment()],
    currentRecruitments: [],
    staffs: managerOnly,
  },
};

export const OnboardingAfterSubmission: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment({ responseCount: 1 })],
    currentRecruitments: [],
    staffs: managerOnly,
  },
};

export const OnboardingAfterShiftConfirmed: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment({ status: "confirmed", responseCount: 1 })],
    currentRecruitments: [],
    staffs: managerOnly,
  },
};

export const OnboardingStaffAdded: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [onboardingRecruitment({ status: "confirmed", responseCount: 1 })],
    currentRecruitments: [],
    staffs: managerAndStaff,
  },
};

export const OnboardingStaffAddedMobile: Story = {
  ...OnboardingStaffAdded,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const DismissedOnboardingShowsNextAction: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    staffs: managerOnly,
  },
  render: () => (
    <Box minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <DashboardContent {...dashboardBaseArgs} recruitments={[]} staffs={managerOnly} />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("region", { name: "シフトリへようこそ！" })).toBeVisible();
    await expect(canvas.queryByRole("heading", { name: "要対応" })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "シフトリへようこそを閉じる" }));

    await expect(await canvas.findByRole("heading", { name: "要対応" })).toBeVisible();
    await expect(canvas.queryByRole("region", { name: "シフトリへようこそ！" })).not.toBeInTheDocument();
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
    screenshot: { skip: true },
  },
  render: () => (
    <Box minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
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
    const canvas = within(canvasElement);
    const reviewButton = await canvas.findByRole("button", { name: /スタッフ登録申請が2件/ });

    await expect(canvas.queryByRole("region", { name: "スタッフ登録申請" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "シフトリへようこそ！" })).not.toBeInTheDocument();

    await userEvent.click(reviewButton);

    const requestItems = await canvas.findByRole("region", { name: "スタッフ登録申請" });
    await waitFor(() => expect(within(requestItems).getByText(/田中 花子さんからスタッフ登録申請/)).toBeVisible());
    await expect(within(requestItems).queryByText("hanako@example.com")).not.toBeInTheDocument();
    await expect(within(requestItems).getAllByRole("button", { name: "承認する" }).length).toBeGreaterThan(0);
  },
};

export const NotificationFailuresShowNextActionDuringOnboarding: Story = {
  args: {
    ...dashboardBaseArgs,
    recruitments: [],
    staffs: managerOnly,
    notificationFailures,
  },
  render: () => (
    <Box minH="100vh" bg="gray.50" py={{ base: 4, md: 8 }}>
      <DashboardContent
        {...dashboardBaseArgs}
        recruitments={[]}
        currentRecruitments={[]}
        staffs={managerOnly}
        notificationFailures={notificationFailures}
      />
    </Box>
  ),
};

export const Setup: Story = {
  args: {
    shop: null,
    showAccountDeletion: false,
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

export const SetupForExistingUserWithoutShop: Story = {
  args: {
    ...Setup.args,
    showAccountDeletion: true,
  },
};

export const SetupWithAnnouncement: Story = {
  args: {
    ...Setup.args,
    showAccountDeletion: true,
    announcement: dashboardAnnouncement,
  },
};

export const SetupMobile: Story = {
  args: {
    ...Setup.args,
    showAccountDeletion: true,
  },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SetupAppCompositionDesktop: Story = {
  name: "初回Setup・新shell・デスクトップ",
  args: Setup.args,
  parameters: { vrt: { releaseFixedHeader: true } },
  render: (args) => (
    <DashboardAppShellPreview>
      <DashboardContent {...args} />
    </DashboardAppShellPreview>
  ),
};

export const SetupAppCompositionMobile: Story = {
  ...SetupAppCompositionDesktop,
  name: "初回Setup・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const SetupDialogBehavior: Story = {
  args: Setup.args,
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "お店を登録する" }));
    const setupDialog = await body.findByRole("dialog", { name: "初回登録" });
    await userEvent.click(within(setupDialog).getAllByRole("button", { name: "閉じる" })[0]);
    await waitFor(() => expect(body.queryByRole("dialog", { name: "初回登録" })).not.toBeInTheDocument());
  },
};

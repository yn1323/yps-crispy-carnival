import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createStore, Provider } from "jotai";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { userAtom } from "@/src/stores/user";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";
import { NotificationFailureRecovery } from "../NotificationFailureRecovery";
import type { OperationContextData } from "../OperationContext";
import { RecruitmentManagement, type RecruitmentManagementData } from "../RecruitmentManagement";
import { StaffManagement, type StaffManagementData } from "../StaffManagement";
import { StaffRegistrationRequestManagement } from "../StaffRegistrationRequestManagement";
import { buildDashboardRecruitmentGroups } from "../script";
import { mockCurrentRecruitments, mockRecruitments, mockStaffs } from "../stories/fixtures";
import type { StaffRegistrationRequest } from "../types";
import { DashboardContentView } from "./DashboardContentView";
import type { DashboardQueryStage } from "./queryStage";

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
  organizationPlan: "pro" as const,
  memberStatus: "active" as const,
};
const operationContextData = {
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
const recruitments = [...mockCurrentRecruitments, ...mockRecruitments];
const groups = buildDashboardRecruitmentGroups({ recruitments }).groups;
const recruitmentData = {
  recruitments,
  groups,
  currentRecruitments: mockCurrentRecruitments,
  hasPastRecruitments: false,
  isPastRecruitmentsVisible: false,
  pastStatus: "Exhausted",
  canLoadMorePastRecruitments: false,
  onShowPastRecruitments: noop,
  onLoadMorePastRecruitments: noop,
} satisfies RecruitmentManagementData;
const staffData = {
  staffs: mockStaffs,
  status: "Exhausted",
  canLoadMore: false,
  onLoadMore: noop,
} satisfies StaffManagementData;
const pendingStaffRequests = [
  {
    _id: "staff-registration-request-1",
    name: "田中 花子",
    email: "hanako@example.com",
    createdAt: Date.now(),
    canApprove: true,
    approveDisabledReason: null,
  },
] as unknown as StaffRegistrationRequest[];
const notificationFailures = [
  {
    _id: "notification-failure-1",
    staffName: "佐藤 真由美",
    notificationKind: "recruitment",
    notificationKindLabel: "シフト募集通知",
    periodLabel: "7/1〜7/15",
    channel: "email",
    lastFailedAt: Date.now(),
    canRetry: true,
  },
] as unknown as DashboardNotificationFailure[];

type FailureKind = "recruitment" | "staff" | "registrationRequests" | "notificationFailures";
type Props = { initialFailures: FailureKind[] };

const storyStore = createStore();
storyStore.set(userAtom, {
  authId: "dashboard-recovery-story-user",
  name: "田中太郎",
  email: "tanaka@example.com",
  featureVisibility: {
    organizationSettingsNavigation: true,
    billing: false,
    shopMembershipAddition: false,
  },
});

function DashboardQueryRecoveryPreview({ initialFailures }: Props) {
  const [failedStages, setFailedStages] = useState(() => new Set(initialFailures));
  const stage = <T,>(kind: FailureKind, data: T): DashboardQueryStage<T> =>
    failedStages.has(kind)
      ? {
          status: "unavailable",
          onRetry: () =>
            setFailedStages((current) => {
              const next = new Set(current);
              next.delete(kind);
              return next;
            }),
        }
      : { status: "ready", data };
  const isRecruitmentAvailable = !failedStages.has("recruitment");

  return (
    <Provider store={storyStore}>
      <Box minH="100vh" bg="gray.50">
        <RootContentWrapper>
          <RecruitmentManagement regularClosedDays={shop.regularClosedDays} data={recruitmentData}>
            {(recruitment) => (
              <StaffManagement
                data={staffData}
                openRecruitments={isRecruitmentAvailable ? recruitment.openRecruitments : []}
                currentRecruitments={isRecruitmentAvailable ? recruitment.currentRecruitments : []}
                recruitmentDataStatus={isRecruitmentAvailable ? "ready" : "unavailable"}
              >
                {(staff) => (
                  <StaffRegistrationRequestManagement requests={pendingStaffRequests}>
                    {(registrationRequests) => (
                      <NotificationFailureRecovery failures={notificationFailures}>
                        {(notificationFailure) => (
                          <DashboardContentView
                            isReadOnly={false}
                            managerLegalConsentStatus={managerLegalConsentReady}
                            isDashboardOnboardingDismissed
                            operationContextData={operationContextData}
                            isBillingFeatureVisible={false}
                            recruitment={stage("recruitment", recruitment)}
                            staff={stage("staff", staff)}
                            registrationRequests={stage("registrationRequests", registrationRequests)}
                            notificationFailures={stage("notificationFailures", notificationFailure)}
                          />
                        )}
                      </NotificationFailureRecovery>
                    )}
                  </StaffRegistrationRequestManagement>
                )}
              </StaffManagement>
            )}
          </RecruitmentManagement>
        </RootContentWrapper>
      </Box>
    </Provider>
  );
}

const meta = {
  title: "Features/Dashboard/DashboardContent/QueryRecovery",
  component: DashboardQueryRecoveryPreview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DashboardQueryRecoveryPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecruitmentQueryUnavailable: Story = {
  args: { initialFailures: ["recruitment"] },
};

export const StaffQueryUnavailable: Story = {
  args: { initialFailures: ["staff"] },
};

export const OperationalTodoQueryUnavailable: Story = {
  args: { initialFailures: ["registrationRequests", "notificationFailures"] },
};

export const MultipleQueryUnavailableMobile: Story = {
  args: { initialFailures: ["recruitment", "staff", "registrationRequests", "notificationFailures"] },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const RecruitmentQueryRecoveryBehavior: Story = {
  args: { initialFailures: ["recruitment"] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { name: /たなかグループ/, level: 2 })).toBeVisible();
    await expect(canvas.getByLabelText("スタッフ一覧")).toBeVisible();
    await expect(canvas.getByText("シフト募集を読み込めませんでした")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "シフト募集を再試行" }));

    await expect(await canvas.findByLabelText("シフト一覧")).toBeVisible();
    await expect(canvas.queryByText("シフト募集を読み込めませんでした")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("スタッフ一覧")).toBeVisible();
  },
};

export const StaffQueryRecoveryBehavior: Story = {
  args: { initialFailures: ["staff"] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByLabelText("シフト一覧")).toBeVisible();
    await expect(canvas.getByText("スタッフ一覧を読み込めませんでした")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "再試行する" }));

    await expect(await canvas.findByLabelText("スタッフ一覧")).toBeVisible();
    await expect(canvas.getByLabelText("シフト一覧")).toBeVisible();
  },
};

export const OperationalTodoQueryRecoveryBehavior: Story = {
  args: { initialFailures: ["registrationRequests", "notificationFailures"] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByLabelText("シフト一覧")).toBeVisible();
    await expect(canvas.getByLabelText("スタッフ一覧")).toBeVisible();
    await expect(canvas.getByText("一部の要対応項目を読み込めませんでした")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "登録申請を再試行" }));
    await userEvent.click(canvas.getByRole("button", { name: "通知を再試行" }));

    await expect(canvas.queryByText("一部の要対応項目を読み込めませんでした")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "申請を確認" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "通知を確認する" })).toBeEnabled();
  },
};

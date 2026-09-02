import { Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { type OrganizationBillingView, OrganizationUsageSection } from "@/src/components/features/OrganizationSettings";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import {
  AppManageBillingPageSkeleton,
  AppManageHeader,
  AppManagePageStateView,
  ManageShopsSection,
  OrganizationBasicInformationSection,
  OrganizationManagementSection,
} from ".";

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 18, max: 50 },
  shopUsage: { current: 6, max: 5 },
  managerUsage: { current: 3, max: 5, pendingInvitations: 1 },
  billingEmail: "billing@example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

const shops = Array.from({ length: 6 }, (_, index) => ({
  id: `shop-preview-${index + 1}`,
  name: index === 5 ? "駅前店" : `${index + 1}号店`,
  regularClosedDays: [],
  submissionPattern: { kind: "dateOnly" as const },
  staffCount: 0,
  canUpdateSettings: false,
  canDelete: false,
}));

const meta = {
  title: "Pages/AppManage/States",
  component: AppManagePageStateView,
  args: { state: { kind: "loading" } },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AppManagePageStateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

export const LoadingMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const BillingLoading: Story = {
  name: "読み込み｜プランと支払い",
  render: () => <AppManageBillingPageSkeleton />,
};

export const BillingLoadingMobile: Story = {
  name: "読み込み｜プランと支払い・モバイル",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <AppManageBillingPageSkeleton />,
};

export const QueryError: Story = {
  args: { state: { kind: "error" } },
};

const organizationId = "organization-preview" as never;

function ReadyPreview() {
  return (
    <Stack gap={6}>
      <AppManageHeader />
      <Stack gap={4}>
        <OrganizationUsageSection billing={billing} showCurrentPlan />
        <OrganizationManagementSection
          organizationId={organizationId}
          organizationName="ハイパーカンパニーグループ"
          managerCount={1}
          pendingManagerCount={0}
          billingState={billing.state}
          canCreateOrganization={false}
        />
      </Stack>
      <ManageShopsSection
        organizationId={organizationId}
        shops={shops}
        shopUsage={billing.shopUsage}
        canAddShop={false}
        canLoadMore={false}
        isLoadingMore={false}
        onLoadMore={() => undefined}
        onOpenShop={() => undefined}
      />
    </Stack>
  );
}

function AppCompositionPreview() {
  return (
    <AuthenticatedAppShell activeKey="manage" activeOrganizationId="organization-preview">
      <AuthenticatedPageContent includeMobileNavigation>
        <ReadyPreview />
      </AuthenticatedPageContent>
    </AuthenticatedAppShell>
  );
}

export const AppCompositionDesktop: Story = {
  name: "管理・新shell・デスクトップ",
  parameters: { layout: "fullscreen", vrt: { releaseFixedHeader: true } },
  render: () => <AppCompositionPreview />,
};

export const AppCompositionMobile: Story = {
  ...AppCompositionDesktop,
  name: "管理・新shell・モバイル414px",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

function RetryPreview() {
  const [retried, setRetried] = useState(false);
  return retried ? (
    <output>管理情報を再読み込みしました</output>
  ) : (
    <AppManagePageStateView state={{ kind: "error" }} onRetry={() => setRetried(true)} />
  );
}

export const QueryErrorRetryBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <RetryPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再試行する" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("管理情報を再読み込みしました");
  },
};

export const OrganizationBasicInformation: Story = {
  render: () => (
    <OrganizationBasicInformationSection
      organizationName="ハイパーカンパニーグループ"
      organizationCreatedAt={Date.parse("2026-08-13T00:00:00+09:00")}
      canUpdateOrganizationName
      onEdit={() => undefined}
    />
  ),
};

export const OrganizationBasicInformationMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: OrganizationBasicInformation.render,
};

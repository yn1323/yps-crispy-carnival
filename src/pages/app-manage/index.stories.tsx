import { Heading, Stack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  type OrganizationBillingView,
  OrganizationUsageSection,
  ShopsSection,
} from "@/src/components/features/OrganizationSettings";
import {
  AppManageHeader,
  AppManagePageStateView,
  AppManageReadOnlyNotice,
  OrganizationBasicInformationSection,
} from ".";

const billing: OrganizationBillingView = {
  state: "business",
  currentPlan: "business",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 18, max: 40 },
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
  name: index === 5 ? "旧駅前店（アーカイブ）" : `${index + 1}号店`,
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

export const QueryError: Story = {
  args: { state: { kind: "error" } },
};

function ReadyReadOnlyPreview() {
  return (
    <Stack gap={6}>
      <AppManageHeader />
      <AppManageReadOnlyNotice memberStatus="readOnly" />
      <OrganizationUsageSection billing={billing} />
      <Heading as="h2" fontSize="lg">
        組織全体
      </Heading>
      <ShopsSection
        shops={shops}
        shopUsage={billing.shopUsage}
        showAddShop
        canAddShop={false}
        addShopDisabledReason="閲覧のみの管理者は店舗を追加できません。"
        onAddShop={() => undefined}
        onOpenShop={() => undefined}
      />
    </Stack>
  );
}

export const ReadyReadOnly: Story = {
  render: () => <ReadyReadOnlyPreview />,
};

export const ReadyReadOnlyMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ReadyReadOnlyPreview />,
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

import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { OperationContextView } from "../OperationContext";
import { buildOperationContextModel } from "../OperationContext/script";
import { PlanStatusCard, type PlanStatusCardData, type PlanStatusCardUsage } from ".";

const noop = () => {};

const storyShop = {
  shopId: "shop-story",
  shopName: "yn1323店舗",
  shopStatus: "active",
  organizationId: "organization-story",
  organizationName: "すーぱーかんぱにー",
  organizationPlan: "standard",
  memberStatus: "active",
} satisfies ShopContextOption;

const storyModel = (() => {
  const model = buildOperationContextModel([storyShop], storyShop.shopId);
  if (!model) throw new Error("組織・プランStoryの店舗データが不正です");
  return model;
})();

const usageWithoutManager = {
  peopleUsage: { current: 12, max: 25 },
  shopUsage: { current: 2, max: 5 },
} satisfies PlanStatusCardUsage;

const trialUsageWithoutManager = {
  ...usageWithoutManager,
  peopleUsage: { current: 12, max: 50 },
} satisfies PlanStatusCardUsage;

const usageWithManager = {
  ...usageWithoutManager,
  managerUsage: { current: 2, max: 5 },
  pendingManagerInvitations: 0,
} satisfies PlanStatusCardUsage;

const usageWithPendingManagerInvitation = {
  ...usageWithManager,
  pendingManagerInvitations: 1,
} satisfies PlanStatusCardUsage;

const standardPlan = {
  kind: "paidPlan",
  planName: "Standard",
  badgeLabel: "利用中",
  nextEventLabel: "次回更新日：2026/9/1",
} satisfies PlanStatusCardData;

const freePlan = {
  kind: "freePlan",
  description: "無料の基本機能を利用しています。必要に応じて有料プランを選べます。",
  primaryAction: { action: "choosePlan", label: "プランを選ぶ" },
} satisfies PlanStatusCardData;

const proPlan = {
  kind: "paidPlan",
  planName: "Pro",
  badgeLabel: "利用中",
  nextEventLabel: "次回更新日：2026/9/1",
} satisfies PlanStatusCardData;

const complimentaryPro = {
  kind: "paidPlan",
  planName: "Pro",
  badgeLabel: "支払い不要",
  description: "早期登録特典によりProプラン相当の機能をずっと無料で利用できます。",
} satisfies PlanStatusCardData;

const scheduledPlanChange = {
  kind: "paidPlan",
  planName: "Pro",
  badgeLabel: "変更予定",
  description: "2026/9/1にStandardプランへ変更します。",
} satisfies PlanStatusCardData;

const trial = {
  kind: "trial",
  remainingDays: 7,
  trialEndsOnLabel: "8/16(日)",
  description:
    "未選択のまま終了するとFreeプランへ移行します。Freeプランの上限を超えている場合は、上限内に減らすまで業務操作が制限されます。",
  primaryAction: { action: "choosePlan", label: "プランを選ぶ" },
  showRemindLater: true,
} satisfies PlanStatusCardData;

const ongoingTrial = {
  ...trial,
  remainingDays: 14,
  trialEndsOnLabel: "8/23(日)",
} satisfies PlanStatusCardData;

const selectedTrial = {
  kind: "trial",
  remainingDays: 7,
  trialEndsOnLabel: "8/16(日)",
  continuationPlanName: "Pro",
  description: "トライアル終了後はProプランへ移行します。",
  showRemindLater: false,
} satisfies PlanStatusCardData;

const paymentPending = {
  kind: "paymentPending",
  currentPlanName: "Free",
  targetPlanName: "Standard",
  description: "Standardプランへの変更結果を確認しています。確認中はFreeプランが適用されます。",
} satisfies PlanStatusCardData;

const paymentIssue = {
  kind: "paymentIssue",
  planName: "Standard",
  phase: "grace",
  description: "サービスの停止を防ぐため、お支払い方法を更新してください。",
  recoveryDeadlineLabel: "支払い期限：2026/8/17",
  primaryAction: { action: "updatePaymentMethod", label: "支払い方法を更新する" },
} satisfies PlanStatusCardData;

const paymentIssueWithoutPermission = {
  kind: "paymentIssue",
  planName: "Standard",
  phase: "grace",
  description: "支払い方法の更新は、契約を管理できる管理者が行えます。",
  recoveryDeadlineLabel: "支払い期限：2026/8/17",
} satisfies PlanStatusCardData;

const restrictedPaymentIssue = {
  kind: "paymentIssue",
  planName: "Pro",
  phase: "restricted",
  description: "データは削除されていません。利用を再開するには、StandardまたはProを契約してください。",
  primaryAction: { action: "choosePlan", label: "プランを選んで再開する" },
} satisfies PlanStatusCardData;

const restricted = {
  kind: "restricted",
  planName: "Free",
  description: "利用状況または契約状態を確認してください。",
} satisfies PlanStatusCardData;

const meta = {
  title: "Features/Dashboard/PlanStatusCard",
  component: PlanStatusCard,
  args: {
    data: standardPlan,
    usage: usageWithoutManager,
    defaultExpanded: false,
    onAction: noop,
  },
  render: (args) => <OrganizationPlanStory {...args} />,
  decorators: [
    (Story) => (
      <Box maxW="400px" mx="auto" p={3}>
        <Story />
      </Box>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    backgrounds: { default: "light" },
  },
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
} satisfies Meta<typeof PlanStatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StandardCollapsed: Story = {
  name: "Standard・折りたたみ",
};

export const StandardExpanded: Story = {
  name: "Standard・展開・利用状況2列",
  args: { defaultExpanded: true },
};

export const StandardWithManagerExpanded: Story = {
  name: "Standard・展開・利用状況3列",
  args: { usage: usageWithManager, defaultExpanded: true },
};

export const StandardWithPendingManagerInvitationExpanded: Story = {
  name: "Standard・展開・管理者招待中",
  args: { usage: usageWithPendingManagerInvitation, defaultExpanded: true },
};

export const StandardUsageLoading: Story = {
  name: "Standard・利用状況読み込み中",
  args: { usage: undefined, defaultExpanded: true },
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveTextContent("プランの利用状況を読み込み中です。");
  },
};

export const StandardUsageUnavailable: Story = {
  name: "Standard・利用状況なし",
  args: { usage: null, defaultExpanded: true },
};

export const FreeExpanded: Story = {
  name: "Free・展開",
  args: { data: freePlan, defaultExpanded: true },
};

export const ProExpanded: Story = {
  name: "Pro・展開",
  args: { data: proPlan, defaultExpanded: true },
};

export const ComplimentaryProExpanded: Story = {
  name: "Pro・支払い不要",
  args: { data: complimentaryPro, defaultExpanded: true },
};

export const ScheduledPlanChangeExpanded: Story = {
  name: "Pro・Standardへ変更予定",
  args: { data: scheduledPlanChange, defaultExpanded: true },
};

export const TrialCollapsed: Story = {
  name: "無料トライアル・折りたたみ",
  args: { data: trial, usage: trialUsageWithoutManager },
};

export const OngoingTrialExpanded: Story = {
  name: "無料トライアル・通常期間",
  args: { data: ongoingTrial, usage: trialUsageWithoutManager, defaultExpanded: true },
};

export const TrialExpanded: Story = {
  name: "無料トライアル・プラン未選択",
  args: { data: trial, usage: trialUsageWithoutManager, defaultExpanded: true },
};

export const TrialWithSelectedPlanExpanded: Story = {
  name: "無料トライアル・Pro選択済み",
  args: { data: selectedTrial, usage: trialUsageWithoutManager, defaultExpanded: true },
};

export const PaymentPendingExpanded: Story = {
  name: "支払い結果を確認中",
  args: { data: paymentPending, defaultExpanded: true },
};

export const PaymentIssueExpanded: Story = {
  name: "支払い猶予中",
  args: { data: paymentIssue, defaultExpanded: true },
};

export const PaymentIssueWithoutPermissionExpanded: Story = {
  name: "支払い猶予中・更新権限なし",
  args: { data: paymentIssueWithoutPermission, defaultExpanded: true },
};

export const RestrictedPaymentIssueExpanded: Story = {
  name: "支払い問題・利用制限中",
  args: { data: restrictedPaymentIssue, defaultExpanded: true },
};

export const RestrictedExpanded: Story = {
  name: "契約状態の確認が必要",
  args: { data: restricted, defaultExpanded: true },
};

export const TrialToggleBehavior: Story = {
  name: "無料トライアル・開閉（操作確認）",
  args: { data: trial, usage: trialUsageWithoutManager },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /すーぱーかんぱにー.*8\/16まで/ });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = await canvas.findByRole("region", { name: "無料トライアルの詳細" });
    await expect(within(details).getByText("8/16(日)にトライアルが終了します。")).toBeInTheDocument();
    await expect(within(details).queryByText("8/16まで")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "後で確認する" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveFocus();
    await waitFor(() => expect(details).not.toBeVisible());
  },
};

export const PaidExpansionBehavior: Story = {
  name: "有料プラン・展開（操作確認）",
  args: { data: standardPlan },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /すーぱーかんぱにー/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = await canvas.findByRole("region", { name: "Standardプランの詳細" });
    const usage = await within(details).findByRole("group", { name: "プランの利用状況" });
    const peopleUsage = within(usage).getByText("12 / 25人");
    await expect(peopleUsage).toHaveAccessibleName("利用人数 現在12人 / 上限25人");

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};

export const UrgentStateAutoExpansionBehavior: Story = {
  name: "要対応状態への遷移で自動展開（操作確認）",
  args: { data: trial, usage: trialUsageWithoutManager },
  parameters: { screenshot: { skip: true } },
  render: () => <UrgentStateAutoExpansionStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /すーぱーかんぱにー.*8\/23まで/ });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(canvas.getByRole("button", { name: "終了7日前へ進める" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await canvas.findByRole("region", { name: "無料トライアルの詳細" });

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};

type OrganizationPlanStoryProps = ComponentProps<typeof PlanStatusCard>;

function OrganizationPlanStory({
  data,
  usage,
  defaultExpanded = false,
  onAction,
  onExpandedChange,
}: OrganizationPlanStoryProps) {
  return (
    <OperationContextView
      model={storyModel}
      onShopSelect={noop}
      onOpenShopDetail={noop}
      onOpenOrganizationSettings={noop}
      billingSettingsShopId={storyShop.shopId}
      planStatusCard={{ data, usage, defaultExpanded, onAction, onExpandedChange }}
    />
  );
}

function UrgentStateAutoExpansionStory() {
  const [isUrgent, setIsUrgent] = useState(false);
  return (
    <>
      <Button mb={3} onClick={() => setIsUrgent(true)}>
        終了7日前へ進める
      </Button>
      <OrganizationPlanStory
        data={isUrgent ? trial : ongoingTrial}
        usage={trialUsageWithoutManager}
        defaultExpanded={isUrgent}
        onAction={noop}
      />
    </>
  );
}

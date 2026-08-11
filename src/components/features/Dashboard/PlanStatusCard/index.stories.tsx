import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/src/components/ui/Button";
import { PlanStatusCard, type PlanStatusCardData, type PlanStatusCardUsage } from ".";

const noop = () => {};

const usageWithoutManager = {
  peopleUsage: { current: 12, max: 20 },
  shopUsage: { current: 2, max: 5 },
} satisfies PlanStatusCardUsage;

const usageWithManager = {
  ...usageWithoutManager,
  managerUsage: { current: 2, max: 5 },
} satisfies PlanStatusCardUsage;

const proPlan = {
  kind: "paidPlan",
  planName: "Pro",
  badgeLabel: "利用中",
  nextEventLabel: "次回更新日：2026/9/1",
  price: { status: "available", label: "月額 1,480円（税抜）" },
  primaryActionLabel: "プランと支払いへ",
} satisfies PlanStatusCardData;

const freePlan = {
  kind: "freePlan",
  description: "無料の基本機能を利用しています。必要に応じて有料プランを選べます。",
  primaryAction: "choosePlan",
  primaryActionLabel: "プランを選ぶ",
} satisfies PlanStatusCardData;

const businessPlan = {
  kind: "paidPlan",
  planName: "Business",
  badgeLabel: "利用中",
  nextEventLabel: "次回更新日：2026/9/1",
  price: { status: "available", label: "月額 5,980円（税込）" },
  primaryActionLabel: "プランと支払いへ",
} satisfies PlanStatusCardData;

const complimentaryBusiness = {
  kind: "paidPlan",
  planName: "Business",
  badgeLabel: "支払い不要",
  description: "Businessプランの機能を料金なしで利用できます。",
  price: null,
  primaryActionLabel: "プランと支払いを確認する",
} satisfies PlanStatusCardData;

const scheduledPlanChange = {
  kind: "paidPlan",
  planName: "Business",
  badgeLabel: "変更予定",
  description: "2026/9/1にProプランへ変更します。",
  price: { status: "available", label: "月額 5,980円（税込）" },
  primaryActionLabel: "プランと支払いへ",
} satisfies PlanStatusCardData;

const trial = {
  kind: "trial",
  remainingDays: 7,
  trialEndsOnLabel: "2026/8/16",
  description: "継続して利用するには、プランの選択が必要です。",
  primaryAction: "choosePlan",
  primaryActionLabel: "プランを選ぶ",
  showRemindLater: true,
} satisfies PlanStatusCardData;

const ongoingTrial = {
  ...trial,
  remainingDays: 14,
  trialEndsOnLabel: "2026/8/23",
} satisfies PlanStatusCardData;

const selectedTrial = {
  kind: "trial",
  remainingDays: 7,
  trialEndsOnLabel: "2026/8/16",
  continuationPlanName: "Pro",
  description: "トライアル終了後はProプランへ移行します。",
  primaryAction: "openPlanAndPayment",
  primaryActionLabel: "プランと支払いを確認する",
  showRemindLater: false,
} satisfies PlanStatusCardData;

const paymentPending = {
  kind: "paymentPending",
  currentPlanName: "Free",
  targetPlanName: "Pro",
  description: "Proプランへの変更結果を確認しています。確認中はFreeプランが適用されます。",
  primaryActionLabel: "プランと支払いを確認する",
} satisfies PlanStatusCardData;

const paymentIssue = {
  kind: "paymentIssue",
  planName: "Pro",
  phase: "grace",
  description: "サービスの停止を防ぐため、お支払い方法を更新してください。",
  recoveryDeadlineLabel: "支払い期限：2026/8/17",
  primaryAction: "updatePaymentMethod",
  primaryActionLabel: "支払い方法を更新する",
  showDetailsAction: true,
} satisfies PlanStatusCardData;

const paymentIssueWithoutPermission = {
  ...paymentIssue,
  description: "支払い方法の更新は、契約を管理できる管理者が行えます。",
  primaryAction: "viewPaymentIssueDetails",
  primaryActionLabel: "詳細を確認する",
  showDetailsAction: false,
} satisfies PlanStatusCardData;

const restrictedPaymentIssue = {
  kind: "paymentIssue",
  planName: "Business",
  phase: "restricted",
  description: "サービスの利用を再開するため、お支払い方法を更新してください。",
  primaryAction: "updatePaymentMethod",
  primaryActionLabel: "支払い方法を更新する",
  showDetailsAction: true,
} satisfies PlanStatusCardData;

const restricted = {
  kind: "restricted",
  planName: "Free",
  description: "利用状況または契約状態を確認し、契約制限を解消してください。",
  primaryActionLabel: "プランと支払いを確認する",
} satisfies PlanStatusCardData;

const meta = {
  title: "Features/Dashboard/PlanStatusCard",
  component: PlanStatusCard,
  args: {
    data: proPlan,
    usage: usageWithoutManager,
    defaultExpanded: false,
    onAction: noop,
  },
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

export const ProCollapsed: Story = {
  name: "Pro・折りたたみ",
};

export const ProExpanded: Story = {
  name: "Pro・展開・利用状況2列",
  args: { defaultExpanded: true },
  play: async ({ canvasElement }) => {
    const details = within(canvasElement).getByRole("region", { name: "Proプランの詳細" });
    const canvas = within(details);
    await expect(canvas.getByText("スタッフ")).toBeVisible();
    const peopleUsage = canvas.getByText("12 / 20人");
    await expect(peopleUsage).toBeVisible();
    await expect(peopleUsage).toHaveAccessibleName("スタッフ 現在12人 / 上限20人");
    await expect(canvas.getByText("店舗")).toBeVisible();
    await expect(canvas.getByText("2 / 5店舗")).toBeVisible();
    await expect(canvas.queryByText("管理者")).not.toBeInTheDocument();
  },
};

export const ProWithManagerExpanded: Story = {
  name: "Pro・展開・利用状況3列",
  args: { usage: usageWithManager, defaultExpanded: true },
  play: async ({ canvasElement }) => {
    const details = within(canvasElement).getByRole("region", { name: "Proプランの詳細" });
    const canvas = within(details);
    await expect(canvas.getByText("スタッフ")).toBeVisible();
    await expect(canvas.getByText("店舗")).toBeVisible();
    await expect(canvas.getByText("管理者")).toBeVisible();
    await expect(canvas.getByText("2 / 5人")).toBeVisible();
  },
};

export const ProUsageLoading: Story = {
  name: "Pro・利用状況読み込み中",
  args: { usage: undefined, defaultExpanded: true },
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveTextContent("プランの利用状況を読み込み中です。");
  },
};

export const ProUsageUnavailable: Story = {
  name: "Pro・利用状況なし",
  args: { usage: null, defaultExpanded: true },
  play: async ({ canvasElement }) => {
    const details = within(canvasElement).getByRole("region", { name: "Proプランの詳細" });
    await expect(within(details).queryByText("スタッフ")).not.toBeInTheDocument();
  },
};

export const ProPriceLoading: Story = {
  name: "Pro・料金読み込み中",
  args: {
    data: { ...proPlan, price: { status: "loading" } },
    defaultExpanded: true,
  },
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveTextContent("現在の料金を読み込み中です。");
  },
};

export const ProPriceError: Story = {
  name: "Pro・料金取得エラー",
  args: {
    data: { ...proPlan, price: { status: "error", message: "現在の料金を取得できませんでした。" } },
    defaultExpanded: true,
  },
};

export const ProPriceWithoutPermission: Story = {
  name: "Pro・料金表示権限なし",
  args: {
    data: {
      ...proPlan,
      price: { status: "unavailable", message: "現在の料金を表示する権限がありません。", canRetry: false },
      primaryActionLabel: "プランと支払いを確認する",
    },
    defaultExpanded: true,
  },
};

export const FreeExpanded: Story = {
  name: "Free・展開",
  args: { data: freePlan, defaultExpanded: true },
};

export const BusinessExpanded: Story = {
  name: "Business・展開",
  args: { data: businessPlan, defaultExpanded: true },
};

export const ComplimentaryBusinessExpanded: Story = {
  name: "Business・支払い不要",
  args: { data: complimentaryBusiness, defaultExpanded: true },
};

export const ScheduledPlanChangeExpanded: Story = {
  name: "Business・Proへ変更予定",
  args: { data: scheduledPlanChange, defaultExpanded: true },
};

export const TrialCollapsed: Story = {
  name: "無料トライアル・折りたたみ",
  args: { data: trial },
};

export const OngoingTrialExpanded: Story = {
  name: "無料トライアル・通常期間",
  args: { data: ongoingTrial, defaultExpanded: true },
};

export const TrialExpanded: Story = {
  name: "無料トライアル・プラン未選択",
  args: { data: trial, defaultExpanded: true },
};

export const TrialWithSelectedPlanExpanded: Story = {
  name: "無料トライアル・Pro選択済み",
  args: { data: selectedTrial, defaultExpanded: true },
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
  name: "契約制限中",
  args: { data: restricted, defaultExpanded: true },
};

export const TrialToggleBehavior: Story = {
  name: "無料トライアル・開閉（操作確認）",
  args: { data: trial },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /無料トライアル/ });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = await canvas.findByRole("region", { name: "無料トライアルの詳細" });

    await userEvent.click(canvas.getByRole("button", { name: "後で確認する" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveFocus();
    await waitFor(() => expect(details).not.toBeVisible());
  },
};

export const PaidExpansionBehavior: Story = {
  name: "有料プラン・展開（操作確認）",
  args: { data: proPlan, onExpandedChange: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /Proプラン/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(args.onExpandedChange).toHaveBeenLastCalledWith(true);
    const details = await canvas.findByRole("region", { name: "Proプランの詳細" });
    const usage = await within(details).findByRole("group", { name: "プランの利用状況" });
    await waitFor(() => expect(usage).toBeVisible());
    await expect(within(usage).getByText("スタッフ")).toBeVisible();
    await expect(within(usage).getByText("店舗")).toBeVisible();

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(args.onExpandedChange).toHaveBeenLastCalledWith(false);
  },
};

export const UrgentStateAutoExpansionBehavior: Story = {
  name: "要対応状態への遷移で自動展開（操作確認）",
  args: { data: trial },
  parameters: { screenshot: { skip: true } },
  render: () => <UrgentStateAutoExpansionStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /無料トライアル/ });

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(canvas.getByRole("button", { name: "終了7日前へ進める" }));
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await canvas.findByRole("region", { name: "無料トライアルの詳細" });

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};

function UrgentStateAutoExpansionStory() {
  const [isUrgent, setIsUrgent] = useState(false);
  return (
    <>
      <Button mb={3} onClick={() => setIsUrgent(true)}>
        終了7日前へ進める
      </Button>
      <PlanStatusCard data={trial} usage={usageWithoutManager} defaultExpanded={isUrgent} onAction={noop} />
    </>
  );
}

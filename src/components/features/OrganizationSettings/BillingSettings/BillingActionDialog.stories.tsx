import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { BillingActionDialog } from "./BillingActionDialog";
import type { BillingActionDialogState } from "./script";

const startStandardDialog: BillingActionDialogState = {
  kind: "startPaidPlan",
  source: "immediate",
  targetPlan: "standard",
  intentKey: "start-standard",
  shopId: "shop-shibuya",
  organizationName: "株式会社さくらダイニング",
  billingStartsOn: "Stripeでの支払い完了日",
  price: {
    status: "available",
    value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1, taxBehavior: "inclusive" },
  },
};

const startProDialog: BillingActionDialogState = {
  ...startStandardDialog,
  targetPlan: "pro",
  intentKey: "start-pro",
  price: {
    status: "available",
    value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
  },
};

const upgradeToProLoadingDialog: BillingActionDialogState = {
  kind: "changePaidPlanNow",
  targetPlan: "pro",
  intentKey: "upgrade-pro",
  shopId: "shop-shibuya",
  organizationName: "株式会社さくらダイニング",
  preview: { status: "loading" },
};

const meta = {
  id: "features-organizationsettings-billingactiondialog",
  title: "Features/OrganizationSettings/3. ダイアログ/Stripe課金操作",
  component: BillingActionDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: startStandardDialog,
    isRunning: false,
    onClose: () => {},
    onRetryPrice: () => {},
    onRetryPreview: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof BillingActionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartStandard: Story = { name: "Standard開始" };

export const StartPro: Story = {
  name: "Pro開始",
  args: {
    dialog: startProDialog,
  },
};

export const RegisterTrialProContinuation: Story = {
  name: "トライアル終了後のPro継続登録",
  args: {
    dialog: {
      ...startProDialog,
      kind: "startPaidPlan",
      source: "trial",
      trialEndsOn: "2026年8月31日",
      billingStartsOn: "2026年9月1日",
    },
  },
};

export const LoadingProPrice: Story = {
  name: "Pro料金を読み込み中",
  args: { dialog: { ...startProDialog, price: { status: "loading" } } },
};

export const ProPriceUnavailable: Story = {
  name: "Pro料金を取得できない",
  args: {
    dialog: {
      ...startProDialog,
      price: { status: "unavailable", reason: "price_unavailable" },
    },
  },
};

export const RetryProPriceBehavior: Story = {
  name: "Pro料金を再読み込み（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...ProPriceUnavailable.args, onRetryPrice: fn() },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Proを開始しますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "料金を再読み込みする" }));
    await expect(args.onRetryPrice).toHaveBeenCalledTimes(1);
  },
};

export const UpgradeToProPreviewLoading: Story = {
  name: "StandardからPro・見積もり中",
  args: {
    dialog: upgradeToProLoadingDialog,
  },
};

export const UpgradeToProPreviewAvailable: Story = {
  name: "StandardからPro・見積もり成功",
  args: {
    dialog: {
      ...upgradeToProLoadingDialog,
      kind: "changePaidPlanNow",
      targetPlan: "pro",
      preview: {
        status: "available",
        value: {
          currency: "jpy",
          amountDue: 1200,
          currentPeriodEnd: Date.parse("2026-08-31T00:00:00+09:00"),
          prorationDate: Date.parse("2026-08-12T10:00:00+09:00"),
        },
      },
    },
  },
};

export const UpgradeToProPreviewError: Story = {
  name: "StandardからPro・見積もり失敗",
  args: {
    dialog: {
      ...upgradeToProLoadingDialog,
      kind: "changePaidPlanNow",
      targetPlan: "pro",
      preview: { status: "error" },
    },
  },
};

export const RetryProPreviewBehavior: Story = {
  name: "日割り見積もりを再読み込み（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...UpgradeToProPreviewError.args, onRetryPreview: fn() },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Proへ変更しますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "見積もりを再読み込みする" }));
    await expect(args.onRetryPreview).toHaveBeenCalledTimes(1);
  },
};

export const ScheduleProToStandard: Story = {
  name: "ProからStandardへ変更予約",
  args: {
    dialog: {
      kind: "schedulePlanChange",
      targetPlan: "standard",
      intentKey: "schedule-standard",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
      requiredReductions: { people: 1, shops: 0, managers: 0 },
    },
  },
};

export const ScheduleServiceStop: Story = {
  name: "期間末の解約予約",
  args: {
    dialog: {
      kind: "scheduleServiceStop",
      targetPlan: "free",
      intentKey: "schedule-service-stop",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const CancelScheduledStandard: Story = {
  name: "Standardへの変更予約取消",
  args: {
    dialog: {
      kind: "cancelScheduledPlanChange",
      targetPlan: "standard",
      intentKey: "cancel-scheduled-standard",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const CancelScheduledServiceStop: Story = {
  name: "解約予約取消",
  args: {
    dialog: {
      kind: "cancelScheduledPlanChange",
      targetPlan: "free",
      isServiceStop: true,
      intentKey: "cancel-scheduled-service-stop",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const Mobile: Story = {
  name: "StandardからPro・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: UpgradeToProPreviewAvailable.args,
};

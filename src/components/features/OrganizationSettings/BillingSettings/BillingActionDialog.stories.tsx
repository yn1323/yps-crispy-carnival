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
  currentPlan: "free",
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
  currentPlan: "standard",
  price: startProDialog.price,
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
      currentPlan: "trial",
      billingStartsOn: "2026年9月1日",
    },
  },
};

export const RegisterTrialStandardContinuation: Story = {
  name: "トライアル終了後のStandard継続登録",
  args: {
    dialog: {
      ...startStandardDialog,
      kind: "startPaidPlan",
      source: "trial",
      currentPlan: "trial",
      billingStartsOn: "2026年9月1日",
    },
  },
  play: async () => {
    const dialog = await within(document.body).findByRole("alertdialog", {
      name: "トライアル終了後、Standardプランを継続しますか？",
    });
    await expect(within(dialog).getByText("トライアル → Standard")).toBeInTheDocument();
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
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Proプランを開始しますか？" });
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
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Proプランへ変更しますか？" });
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
      currentPlan: "pro",
      price: startStandardDialog.price,
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
      currentPlan: "standard",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const ScheduleProServiceStop: Story = {
  name: "Proから期間末の解約予約",
  args: {
    dialog: {
      ...(ScheduleServiceStop.args?.dialog as BillingActionDialogState),
      currentPlan: "pro",
      intentKey: "schedule-pro-service-stop",
    },
  },
};

export const CancelTrialContinuation: Story = {
  name: "トライアルの継続取消",
  args: {
    dialog: {
      kind: "cancelTrialContinuation",
      targetPlan: "pro",
      intentKey: "cancel-trial-continuation",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      currentPlan: "trial",
      effectiveOn: "2026年9月1日",
    },
  },
  play: async () => {
    const dialog = await within(document.body).findByRole("alertdialog", {
      name: "プラン支払い予約を取り消しますか？",
    });
    await expect(within(dialog).getByText("トライアル → Pro")).toBeInTheDocument();
  },
};

export const CancelTrialStandardContinuation: Story = {
  name: "トライアルのStandard継続取消",
  args: {
    dialog: {
      kind: "cancelTrialContinuation",
      targetPlan: "standard",
      intentKey: "cancel-trial-standard-continuation",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      currentPlan: "trial",
      effectiveOn: "2026年9月1日",
    },
  },
  play: async () => {
    const dialog = await within(document.body).findByRole("alertdialog", {
      name: "プラン支払い予約を取り消しますか？",
    });
    await expect(within(dialog).getByText("トライアル → Standard")).toBeInTheDocument();
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
      currentPlan: "pro",
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
      currentPlan: "pro",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const CancelScheduledStandardServiceStop: Story = {
  name: "Standardの解約予約取消",
  args: {
    dialog: {
      ...(CancelScheduledServiceStop.args?.dialog as BillingActionDialogState),
      currentPlan: "standard",
      intentKey: "cancel-scheduled-standard-service-stop",
    },
  },
  play: async () => {
    const dialog = await within(document.body).findByRole("alertdialog", {
      name: "解約予約を取り消しますか？",
    });
    await expect(within(dialog).getByText("Standard → Free")).toBeInTheDocument();
  },
};

export const LongOrganizationName: Story = {
  name: "長い組織名",
  args: {
    dialog: {
      ...startStandardDialog,
      organizationName: "株式会社さくらダイニング東日本エリア第一運営本部シフト管理グループ",
    },
  },
};

export const Mobile: Story = {
  name: "StandardからPro・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: UpgradeToProPreviewAvailable.args,
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { BillingActionDialog } from "./BillingActionDialog";
import type { BillingActionDialogState } from "./script";

const startProDialog: BillingActionDialogState = {
  kind: "startPaidPlan",
  source: "immediate",
  targetPlan: "pro",
  intentKey: "start-pro",
  shopId: "shop-shibuya",
  organizationName: "株式会社さくらダイニング",
  billingStartsOn: "Stripeでの支払い完了日",
  price: {
    status: "available",
    value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1, taxBehavior: "inclusive" },
  },
};

const startBusinessDialog: BillingActionDialogState = {
  ...startProDialog,
  targetPlan: "business",
  intentKey: "start-business",
  price: {
    status: "available",
    value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
  },
};

const upgradeToBusinessLoadingDialog: BillingActionDialogState = {
  kind: "changePaidPlanNow",
  targetPlan: "business",
  intentKey: "upgrade-business",
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
    dialog: startProDialog,
    isRunning: false,
    onClose: () => {},
    onRetryPrice: () => {},
    onRetryPreview: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof BillingActionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartPro: Story = { name: "Pro開始" };

export const StartBusiness: Story = {
  name: "Business開始",
  args: {
    dialog: startBusinessDialog,
  },
};

export const RegisterTrialBusinessContinuation: Story = {
  name: "トライアル終了後のBusiness継続登録",
  args: {
    dialog: {
      ...startBusinessDialog,
      kind: "startPaidPlan",
      source: "trial",
      billingStartsOn: "2026年9月1日",
    },
  },
};

export const LoadingBusinessPrice: Story = {
  name: "Business料金を読み込み中",
  args: { dialog: { ...startBusinessDialog, price: { status: "loading" } } },
};

export const BusinessPriceUnavailable: Story = {
  name: "Business料金を取得できない",
  args: {
    dialog: {
      ...startBusinessDialog,
      price: { status: "unavailable", reason: "price_unavailable" },
    },
  },
};

export const RetryBusinessPriceBehavior: Story = {
  name: "Business料金を再読み込み（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...BusinessPriceUnavailable.args, onRetryPrice: fn() },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Businessを開始しますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "料金を再読み込みする" }));
    await expect(args.onRetryPrice).toHaveBeenCalledTimes(1);
  },
};

export const UpgradeToBusinessPreviewLoading: Story = {
  name: "ProからBusiness・見積もり中",
  args: {
    dialog: upgradeToBusinessLoadingDialog,
  },
};

export const UpgradeToBusinessPreviewAvailable: Story = {
  name: "ProからBusiness・見積もり成功",
  args: {
    dialog: {
      ...upgradeToBusinessLoadingDialog,
      kind: "changePaidPlanNow",
      targetPlan: "business",
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

export const UpgradeToBusinessPreviewError: Story = {
  name: "ProからBusiness・見積もり失敗",
  args: {
    dialog: {
      ...upgradeToBusinessLoadingDialog,
      kind: "changePaidPlanNow",
      targetPlan: "business",
      preview: { status: "error" },
    },
  },
};

export const RetryBusinessPreviewBehavior: Story = {
  name: "日割り見積もりを再読み込み（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...UpgradeToBusinessPreviewError.args, onRetryPreview: fn() },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole("alertdialog", { name: "Businessへ変更しますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "見積もりを再読み込みする" }));
    await expect(args.onRetryPreview).toHaveBeenCalledTimes(1);
  },
};

export const ScheduleBusinessToPro: Story = {
  name: "BusinessからProへ変更予約",
  args: {
    dialog: {
      kind: "schedulePlanChange",
      targetPlan: "pro",
      intentKey: "schedule-pro",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
      requiredReductions: { people: 1, shops: 0, managers: 0 },
    },
  },
};

export const ScheduleServiceStop: Story = {
  name: "期間末の利用停止予約",
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

export const CancelScheduledPro: Story = {
  name: "Proへの変更予約取消",
  args: {
    dialog: {
      kind: "cancelScheduledPlanChange",
      targetPlan: "pro",
      intentKey: "cancel-scheduled-pro",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const Mobile: Story = {
  name: "ProからBusiness・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: UpgradeToBusinessPreviewAvailable.args,
};

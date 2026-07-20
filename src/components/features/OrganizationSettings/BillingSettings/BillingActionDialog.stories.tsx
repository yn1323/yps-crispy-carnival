import type { Meta, StoryObj } from "@storybook/react-vite";
import { BillingActionDialog } from "./BillingActionDialog";

const meta = {
  id: "features-organizationsettings-billingactiondialog",
  title: "Features/OrganizationSettings/3. ダイアログ/Stripe課金操作",
  component: BillingActionDialog,
  parameters: { layout: "fullscreen" },
  args: {
    dialog: {
      kind: "startPro",
      source: "immediate",
      intentKey: "start-pro",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      billingStartsOn: "Stripeでの支払い完了後",
      shopNames: ["渋谷店", "新宿店"],
      price: {
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
      },
    },
    isRunning: false,
    onClose: () => {},
    onSubmit: () => {},
  },
} satisfies Meta<typeof BillingActionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartPro: Story = { name: "Pro開始" };

export const RegisterTrialContinuation: Story = {
  name: "トライアル終了後のPro継続登録",
  args: {
    dialog: {
      kind: "startPro",
      source: "trial",
      intentKey: "trial-continuation",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      billingStartsOn: "2026年9月1日",
      shopNames: ["渋谷店", "新宿店"],
      price: {
        currency: "jpy",
        unitAmount: 3000,
        interval: "month",
        intervalCount: 1,
      },
    },
  },
};

export const CancelTrialContinuation: Story = {
  name: "トライアル終了後のPro継続取消",
  args: {
    dialog: {
      kind: "cancelTrialContinuation",
      intentKey: "cancel-trial-continuation",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      trialEndsOn: "2026年8月31日",
    },
  },
};

export const ScheduleFree: Story = {
  name: "無料への変更予約",
  args: {
    dialog: {
      kind: "scheduleFree",
      intentKey: "schedule-free",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const CancelScheduledFree: Story = {
  name: "無料への変更予約取消",
  args: {
    dialog: {
      kind: "cancelScheduledFree",
      intentKey: "cancel-scheduled-free",
      shopId: "shop-shibuya",
      organizationName: "株式会社さくらダイニング",
      effectiveOn: "2026年8月31日",
    },
  },
};

export const Mobile: Story = {
  name: "Pro開始・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

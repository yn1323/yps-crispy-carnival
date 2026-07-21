import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import type { OrganizationBillingView } from "./types";

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 30 },
  shopUsage: { current: 1, max: 5 },
  nextEvent: { label: "次回更新日", date: "2026年8月31日" },
  billingEmail: "billing@example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

const meta = {
  id: "features-organizationsettings-planandpaymentsection",
  title: "Features/OrganizationSettings/2. セクション/プランと支払い",
  component: PlanAndPaymentSection,
  parameters: { layout: "padded" },
  args: {
    billing,
    onManagePlan: fn(),
    onUpdatePaymentMethod: fn(),
    onUpdateBillingEmail: fn(),
    onOpenBillingDocuments: fn(),
  },
} satisfies Meta<typeof PlanAndPaymentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentPlan: Story = { name: "現在のプラン" };

export const Trial: Story = {
  name: "トライアル",
  args: {
    billing: {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasStripeCustomer: false,
      peopleUsage: { current: 4, max: 30 },
      shopUsage: { current: 1, max: 5 },
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    },
  },
};

export const MobileTrial: Story = {
  name: "トライアル・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Trial.args,
};

export const PaymentGrace: Story = {
  name: "支払い猶予",
  args: {
    billing: {
      ...billing,
      state: "grace",
      blockedReason: "支払い方法を更新しないまま期限を過ぎると、契約制限中へ移行します。",
      nextEvent: { label: "支払い猶予期限", date: "2026年8月10日" },
      canScheduleFree: false,
    },
  },
};

export const MobilePaymentGrace: Story = {
  name: "支払い猶予・モバイル",
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: PaymentGrace.args,
};

export const Restricted: Story = {
  name: "契約制限",
  args: {
    billing: {
      ...billing,
      state: "restricted",
      currentPlan: null,
      previousPlan: "pro",
      peopleUsage: { current: 7, max: 5 },
      shopUsage: { current: 2, max: 1 },
      blockedReason: "無料の利用人数または店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。",
      nextEvent: undefined,
      canScheduleFree: false,
    },
  },
};

export const MobileRestricted: Story = {
  name: "契約制限・狭幅モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Restricted.args,
};

export const StripePortalActionsBehavior: Story = {
  name: "Stripe Portal導線（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    onUpdatePaymentMethod: fn(),
    onOpenBillingDocuments: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "支払い方法を見る" }));
    await userEvent.click(canvas.getByRole("button", { name: "請求書・領収書を見る" }));
    await expect(args.onUpdatePaymentMethod).toHaveBeenCalledTimes(1);
    await expect(args.onOpenBillingDocuments).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByText("発行済みの請求書はありません。")).not.toBeInTheDocument();
  },
};

export const CustomerNotCreated: Story = {
  name: "Stripe Customer未作成",
  args: {
    billing: {
      ...billing,
      hasStripeCustomer: false,
      canUpdatePaymentMethod: false,
      paymentMethodDisabledReason: "Stripeの契約情報を準備中です。しばらくしてからもう一度お試しください。",
    },
  },
};

export const StripeUnavailableWithExistingCustomerBehavior: Story = {
  name: "Stripe停止中・既存Customer（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: {
    billing: {
      ...billing,
      stripeBillingAvailable: false,
      hasStripeCustomer: true,
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
      managePlanDisabledReason: "Proの料金は準備中です。",
      paymentMethodDisabledReason: "Proの料金は準備中です。",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "支払い方法を見る" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "請求書・領収書を見る" })).toBeDisabled();
  },
};

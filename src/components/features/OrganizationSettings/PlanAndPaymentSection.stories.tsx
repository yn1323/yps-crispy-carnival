import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import type { BillingPlanPrices, OrganizationBillingView } from "./types";

const availablePrices: BillingPlanPrices = {
  pro: {
    status: "available",
    value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1 },
  },
  business: {
    status: "available",
    value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1 },
  },
};

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 12, max: 20, pendingInvitations: 1 },
  shopUsage: { current: 3, max: 5 },
  managerUsage: { current: 2, max: 5, pendingInvitations: 1 },
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
    planPrices: availablePrices,
    onManagePlan: fn(),
    onRetryPlanPrice: fn(),
    onUpdatePaymentMethod: fn(),
    onUpdateBillingEmail: fn(),
    onOpenBillingDocuments: fn(),
  },
} satisfies Meta<typeof PlanAndPaymentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pro: Story = { name: "Pro" };

export const Free: Story = {
  name: "Free",
  args: {
    billing: {
      ...billing,
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 5, max: 5 },
      shopUsage: { current: 1, max: 1 },
      managerUsage: { current: 1, max: 1 },
      nextEvent: undefined,
      hasStripeCustomer: false,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    },
  },
};

export const Trial: Story = {
  name: "トライアル",
  args: {
    billing: {
      ...billing,
      state: "trial",
      currentPlan: "trial",
      hasStripeCustomer: false,
      peopleUsage: { current: 12, max: 20 },
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    },
  },
};

export const TrialWithBusinessContinuation: Story = {
  name: "トライアル・Business継続登録済み",
  args: {
    billing: {
      ...Trial.args?.billing,
      hasTrialContinuation: true,
      targetPlan: "business",
      hasStripeCustomer: true,
    } as OrganizationBillingView,
  },
};

export const Business: Story = {
  name: "Business",
  args: {
    billing: {
      ...billing,
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 32, max: 40 },
    },
  },
};

export const ComplimentaryBusiness: Story = {
  name: "支払い不要Business",
  args: {
    billing: {
      ...billing,
      state: "business",
      currentPlan: "business",
      isComplimentary: true,
      peopleUsage: { current: 32, max: 50 },
      nextEvent: undefined,
      hasStripeCustomer: false,
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
      canScheduleFree: false,
    },
  },
};

export const ScheduledBusinessToPro: Story = {
  name: "BusinessからProへ変更予定",
  args: {
    billing: {
      ...Business.args?.billing,
      state: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      requiredReductions: { people: 1, shops: 0, managers: 0 },
      peopleUsage: { current: 21, max: 20 },
      nextEvent: { label: "Pro適用予定日", date: "2026年8月31日" },
      canScheduleFree: false,
    } as OrganizationBillingView,
  },
};

export const RestrictedForPro: Story = {
  name: "Pro上限の契約制限",
  args: {
    billing: {
      ...billing,
      state: "restricted",
      currentPlan: null,
      previousPlan: "business",
      targetPlan: "pro",
      limitPlan: "pro",
      requiredReductions: { people: 1, shops: 0, managers: 0 },
      peopleUsage: { current: 21, max: 20 },
      blockedReason: "Proの利用人数を超えています。",
      nextEvent: undefined,
      canManagePlan: false,
      canScheduleFree: false,
    },
  },
};

export const RestrictedForFree: Story = {
  name: "Free上限の契約制限",
  args: {
    billing: {
      ...billing,
      state: "restricted",
      currentPlan: null,
      previousPlan: "pro",
      targetPlan: "free",
      limitPlan: "free",
      requiredReductions: { people: 2, shops: 1, managers: 1 },
      peopleUsage: { current: 7, max: 5 },
      shopUsage: { current: 2, max: 1 },
      managerUsage: { current: 2, max: 1 },
      blockedReason: "Freeの利用上限を超えています。",
      nextEvent: undefined,
      canManagePlan: false,
      canScheduleFree: false,
    },
  },
};

export const PriceLoading: Story = {
  name: "料金を読み込み中",
  args: { planPrices: { pro: { status: "loading" }, business: { status: "loading" } } },
};

export const BusinessPriceUnavailable: Story = {
  name: "Business料金が未設定",
  args: {
    planPrices: {
      ...availablePrices,
      business: { status: "unavailable", reason: "price_unavailable" },
    },
  },
};

export const PriceError: Story = {
  name: "料金の取得に失敗",
  args: { planPrices: { pro: { status: "error" }, business: { status: "error" } } },
};

export const RetryBusinessPriceBehavior: Story = {
  name: "Business料金を再読み込み（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...BusinessPriceUnavailable.args, onRetryPlanPrice: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "料金を再読み込み" }));
    await expect(args.onRetryPlanPrice).toHaveBeenCalledWith("business");
  },
};

export const FreePlanSelectionBehavior: Story = {
  name: "Freeから有料プランを選ぶ（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...Free.args, onManagePlan: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Proへ変更" }));
    await userEvent.click(canvas.getByRole("button", { name: "Businessへ変更" }));
    await expect(args.onManagePlan).toHaveBeenNthCalledWith(1, "pro");
    await expect(args.onManagePlan).toHaveBeenNthCalledWith(2, "business");
  },
};

export const ProUpgradeSelectionBehavior: Story = {
  name: "ProからBusinessを選ぶ（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { onManagePlan: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Businessへ変更" }));
    await expect(args.onManagePlan).toHaveBeenCalledTimes(1);
    await expect(args.onManagePlan).toHaveBeenCalledWith("business");
  },
};

export const ComplimentaryBusinessHasNoBillingActionsBehavior: Story = {
  name: "支払い不要Businessに課金操作を出さない（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: ComplimentaryBusiness.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: /へ変更|変更予約を取り消す/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "料金を再読み込み" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "支払い方法を見る" })).not.toBeInTheDocument();
  },
};

export const StripePortalActionsBehavior: Story = {
  name: "Stripe Portal導線（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { onUpdatePaymentMethod: fn(), onOpenBillingDocuments: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "支払い方法を見る" }));
    await userEvent.click(canvas.getByRole("button", { name: "請求書・領収書を見る" }));
    await expect(args.onUpdatePaymentMethod).toHaveBeenCalledTimes(1);
    await expect(args.onOpenBillingDocuments).toHaveBeenCalledTimes(1);
  },
};

export const MobileFree: Story = {
  name: "Free・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Free.args,
};

export const MobileBusiness: Story = {
  name: "Business・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Business.args,
};

export const MobileRestricted: Story = {
  name: "Pro上限の契約制限・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: RestrictedForPro.args,
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import type { BillingPlanPrices, OrganizationBillingView } from "./types";

const availablePrices: BillingPlanPrices = {
  pro: {
    status: "available",
    value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1, taxBehavior: "inclusive" },
  },
  business: {
    status: "available",
    value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1, taxBehavior: "exclusive" },
  },
};

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 12, max: 25, pendingInvitations: 1 },
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
    pendingCheckout: {
      status: "idle",
      isCancelling: false,
      onContinue: fn(),
      onCancel: fn(),
      onRetry: fn(),
    },
  },
} satisfies Meta<typeof PlanAndPaymentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pro: Story = { name: "Standard" };

export const Free: Story = {
  name: "Free",
  args: {
    billing: {
      ...billing,
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 5, max: 5 },
      shopUsage: { current: 1, max: 1 },
      managerUsage: { current: 1, max: 2 },
      nextEvent: undefined,
      hasStripeCustomer: false,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    },
  },
};

export const FreeOverLimit: Story = {
  name: "Free・上限超過",
  args: {
    billing: {
      ...(Free.args?.billing as OrganizationBillingView),
      peopleUsage: { current: 7, max: 5, pendingInvitations: 0 },
      shopUsage: { current: 2, max: 1, pendingInvitations: 0 },
      managerUsage: { current: 3, max: 2, pendingInvitations: 1 },
      requiredReductions: { people: 2, shops: 1, managers: 1 },
      blockedReason:
        "現在のプランの利用上限を超えています。\n利用人数・稼働店舗・有効管理者を上限内まで減らすと、業務操作は自動的に再開されます。",
      canManagePlan: true,
    },
  },
};

export const FreeOverLimitBehavior: Story = {
  name: "Free・上限超過の表示と契約導線（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { ...FreeOverLimit.args, onManagePlan: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("heading", { name: "Free" })).toHaveLength(2);
    await expect(canvas.getAllByText("上限超過").length).toBeGreaterThanOrEqual(1);
    await expect(canvas.getByText("上限超過のため利用を制限しています")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Standardへ変更" }));
    await expect(args.onManagePlan).toHaveBeenCalledWith("pro");
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
      peopleUsage: { current: 12, max: 50 },
      nextEvent: { label: "トライアル最終日", date: "2026年8月31日" },
      canScheduleFree: false,
    },
  },
};

export const TrialWithBusinessContinuation: Story = {
  name: "トライアル・Pro継続登録済み",
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
  name: "Pro",
  args: {
    billing: {
      ...billing,
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 32, max: 50 },
    },
  },
};

export const ComplimentaryBusiness: Story = {
  name: "支払い不要Pro",
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
  name: "ProからStandardへ変更予定",
  args: {
    billing: {
      ...Business.args?.billing,
      state: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      requiredReductions: { people: 1, shops: 0, managers: 0 },
      peopleUsage: { current: 21, max: 25 },
      nextEvent: { label: "Standard適用予定日", date: "2026年8月31日" },
      canScheduleFree: false,
    } as OrganizationBillingView,
  },
};

export const ServiceStopScheduled: Story = {
  name: "解約予定",
  args: {
    billing: {
      ...Business.args?.billing,
      state: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      restrictAtPeriodEnd: true,
      requiredReductions: { people: 0, shops: 0, managers: 0 },
      nextEvent: { label: "契約終了日", date: "2026年9月17日" },
      canScheduleFree: false,
    } as OrganizationBillingView,
  },
};

export const ServiceStopScheduledBehavior: Story = {
  name: "解約予定の表示（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: ServiceStopScheduled.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(canvas.getByText("Standard → Free")).toBeVisible();
    await expect(canvas.getByText("解約後もデータを閲覧できます。")).toBeVisible();
  },
};

export const RestrictedForPro: Story = {
  name: "Standard上限の契約制限",
  args: {
    billing: {
      ...billing,
      state: "restricted",
      currentPlan: null,
      previousPlan: "business",
      targetPlan: "pro",
      limitPlan: "pro",
      requiredReductions: { people: 1, shops: 0, managers: 0 },
      peopleUsage: { current: 21, max: 25 },
      blockedReason: "Standardの利用人数を超えています。",
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

export const RestrictedAfterTrial: Story = {
  name: "トライアル終了後の利用停止",
  args: {
    billing: {
      ...billing,
      state: "restricted",
      currentPlan: null,
      previousPlan: undefined,
      targetPlan: undefined,
      limitPlan: undefined,
      blockedReason: "現在の契約状態では業務データを更新できません。",
      nextEvent: undefined,
      hasStripeCustomer: false,
      canManagePlan: true,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
    },
  },
};

export const PendingCheckoutOpen: Story = {
  name: "支払い手続きが未完了",
  args: {
    billing: {
      ...billing,
      state: "pendingActivation",
      currentPlan: "free",
      targetPlan: "pro",
      nextEvent: undefined,
      hasStripeCustomer: true,
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canScheduleFree: false,
      blockedReason: "有料プランの支払い結果を確認中です。無料の基本機能は引き続き利用できます。",
    },
    pendingCheckout: {
      status: "open",
      isCancelling: false,
      onContinue: fn(),
      onCancel: fn(),
      onRetry: fn(),
    },
  },
};

export const PriceLoading: Story = {
  name: "料金を読み込み中",
  args: { planPrices: { pro: { status: "loading" }, business: { status: "loading" } } },
};

export const BusinessPriceUnavailable: Story = {
  name: "Pro料金が未設定",
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
  name: "Pro料金を再読み込み（操作確認）",
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
    await userEvent.click(canvas.getByRole("button", { name: "Standardへ変更" }));
    await userEvent.click(canvas.getByRole("button", { name: "Proへ変更" }));
    await expect(args.onManagePlan).toHaveBeenNthCalledWith(1, "pro");
    await expect(args.onManagePlan).toHaveBeenNthCalledWith(2, "business");
  },
};

export const ProUpgradeSelectionBehavior: Story = {
  name: "StandardからProを選ぶ（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { onManagePlan: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Proへ変更" }));
    await expect(args.onManagePlan).toHaveBeenCalledTimes(1);
    await expect(args.onManagePlan).toHaveBeenCalledWith("business");
  },
};

export const ComplimentaryBusinessHasNoBillingActionsBehavior: Story = {
  name: "支払い不要Proに課金操作を出さない（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: ComplimentaryBusiness.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: /へ変更|変更予約を取り消す/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "料金を再読み込み" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "支払い方法・請求書・領収書を見る" })).not.toBeInTheDocument();
    await expect(canvas.getByText("次の支払日")).toBeVisible();
    await expect(canvas.getByText("なし")).toBeVisible();
    await expect(canvas.getByText("早期登録特典により利用料金はかかりません。")).toBeVisible();
  },
};

export const StripePortalActionsBehavior: Story = {
  name: "Stripe Portal導線（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: { onUpdatePaymentMethod: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "支払い方法・請求書・領収書を見る" }));
    await expect(args.onUpdatePaymentMethod).toHaveBeenCalledTimes(1);
  },
};

export const PendingCheckoutActionsBehavior: Story = {
  name: "未完了の支払いを続ける・やめる（操作確認）",
  parameters: { screenshot: { skip: true } },
  args: PendingCheckoutOpen.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "支払いをやめる" }));
    await userEvent.click(canvas.getByRole("button", { name: "支払いを続ける" }));
    await expect(args.pendingCheckout?.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.pendingCheckout?.onContinue).toHaveBeenCalledTimes(1);
  },
};

export const MobileFree: Story = {
  name: "Free・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Free.args,
};

export const MobileBusiness: Story = {
  name: "Pro・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Business.args,
};

export const MobileRestricted: Story = {
  name: "Standard上限の契約制限・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: RestrictedForPro.args,
};

export const MobileFreeOverLimit: Story = {
  name: "Free・上限超過・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: FreeOverLimit.args,
};

export const MobilePendingCheckoutOpen: Story = {
  name: "支払い手続きが未完了・モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: PendingCheckoutOpen.args,
};

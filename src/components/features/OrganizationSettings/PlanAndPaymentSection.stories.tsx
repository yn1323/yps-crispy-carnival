import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import type { OrganizationBillingView } from "./types";

const billing: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  peopleUsage: { current: 4, max: 15 },
  shopUsage: { current: 1, max: 5 },
  nextEvent: { label: "次回更新日", date: "2026年8月31日" },
  paymentMethodLabel: "Visa •••• 4242",
  billingEmail: "billing@example.com",
  invoices: [
    { id: "invoice-july", issuedAt: "2026年7月31日", status: "paid" },
    { id: "invoice-june", issuedAt: "2026年6月30日", status: "paid" },
    { id: "invoice-may", issuedAt: "2026年5月31日", status: "paid" },
  ],
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
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
    onOpenInvoice: fn(),
  },
} satisfies Meta<typeof PlanAndPaymentSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentPlan: Story = { name: "現在のプラン" };

export const PaymentGrace: Story = {
  name: "支払い猶予",
  args: {
    billing: {
      ...billing,
      state: "grace",
      blockedReason: "支払い方法を更新しないまま期限を過ぎると、契約制限中へ移行します。",
      nextEvent: { label: "支払い猶予期限", date: "2026年8月10日" },
      invoices: [{ id: "invoice-july", issuedAt: "2026年7月31日", status: "open" }, ...billing.invoices.slice(1)],
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
      peopleUsage: { current: 7, max: 4 },
      shopUsage: { current: 2, max: 1 },
      blockedReason: "Freeの利用人数または店舗数を超えています。ユーザーまたは店舗を削除してから再確認してください。",
      nextEvent: undefined,
      invoices: [{ id: "invoice-july", issuedAt: "2026年7月31日", status: "open" }, ...billing.invoices.slice(1)],
    },
  },
};

export const MobileRestricted: Story = {
  name: "契約制限・狭幅モバイル",
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: Restricted.args,
};

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
  billingEmail: "billing@example.com",
  invoices: [],
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
};

const meta = {
  title: "Features/OrganizationSettings/PlanAndPaymentSection",
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

export const CurrentPlan: Story = {};

export const PaymentGrace: Story = {
  args: {
    billing: {
      ...billing,
      state: "grace",
      blockedReason: "支払い方法を更新しないまま期限を過ぎると、契約制限中へ移行します。",
      nextEvent: { label: "支払い猶予期限", date: "2026年8月10日" },
    },
  },
};

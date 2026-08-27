import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { PublicPlanPriceCatalog } from "@/src/domains/publicPricing";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "@/src/domains/publicPricing/fixture";
import { PricingSection } from ".";

const meta = {
  title: "Features/LandingPage/PricingSection",
  component: PricingSection,
  args: {
    prices: PUBLIC_PLAN_PRICE_FIXTURE,
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PricingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trialNotice = within(canvas.getByLabelText("Proプランの無料トライアル"));

    await expect(trialNotice.getByText("登録から2か月間")).toBeInTheDocument();
    await expect(trialNotice.getByText("Proプランを無料でお試し")).toBeInTheDocument();
    await expect(trialNotice.getByText("クレジットカード不要")).toBeInTheDocument();
    await expect(trialNotice.getByText("スタッフ50名・5店舗・管理者5名まで")).toBeInTheDocument();
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

const injectedPrices = {
  standard: {
    currency: "jpy",
    unitAmount: 12_345,
    interval: "week",
    intervalCount: 2,
    taxBehavior: "exclusive",
  },
  pro: {
    currency: "jpy",
    unitAmount: 54_321,
    interval: "week",
    intervalCount: 2,
    taxBehavior: "exclusive",
  },
} as const satisfies PublicPlanPriceCatalog;

export const InjectedPriceCatalog: Story = {
  args: {
    prices: injectedPrices,
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByLabelText("¥12,345/2週間（税別）")).toBeInTheDocument();
    await expect(canvas.getByLabelText("¥54,321/2週間（税別）")).toBeInTheDocument();
  },
};

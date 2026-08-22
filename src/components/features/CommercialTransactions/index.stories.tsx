import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { formatPublicPlanPriceLine, type PublicPlanPriceCatalog } from "@/src/domains/publicPricing";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "@/src/domains/publicPricing/fixture";
import { CommercialTransactions } from ".";

const INJECTED_PRICE_CATALOG = {
  pro: {
    currency: "jpy",
    unitAmount: 12_345,
    interval: "week",
    intervalCount: 2,
    taxBehavior: "exclusive",
  },
  business: {
    currency: "jpy",
    unitAmount: 67_890,
    interval: "week",
    intervalCount: 2,
    taxBehavior: "exclusive",
  },
} as const satisfies PublicPlanPriceCatalog;

const meta = {
  title: "Features/CommercialTransactions",
  component: CommercialTransactions,
  args: {
    prices: PUBLIC_PLAN_PRICE_FIXTURE,
  },
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof CommercialTransactions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "特定商取引法に基づく表記" })).toBeVisible();
    await expect(canvas.getByText("役務提供事業者")).toBeVisible();
    await expect(canvas.getByText("販売価格")).toBeVisible();
    await expect(canvas.getByText("Pro：", { exact: false })).toHaveTextContent(
      formatPublicPlanPriceLine(PUBLIC_PLAN_PRICE_FIXTURE.pro),
    );
    await expect(canvas.getByText("Business：", { exact: false })).toHaveTextContent(
      formatPublicPlanPriceLine(PUBLIC_PLAN_PRICE_FIXTURE.business),
    );
    await expect(
      canvas.getByText(`無料トライアルは利用人数${ORGANIZATION_PLAN_LIMITS.trial.maxPeople}名`, { exact: false }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "お問い合わせフォーム" })).toHaveAttribute("href", "/contact");
    await expect(canvas.getByText("事業者名、運営責任者、所在地、電話番号", { exact: false })).toBeVisible();
    await expect(canvas.getByText("動作環境")).toBeVisible();
  },
};

export const InjectedCatalogContract: Story = {
  tags: ["docs-only"],
  args: {
    prices: INJECTED_PRICE_CATALOG,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const plan of ["pro", "business"] as const) {
      const price = INJECTED_PRICE_CATALOG[plan];
      const visiblePrice = canvas.getByText(formatPublicPlanPriceLine(price));

      await expect(visiblePrice).toHaveAttribute("data-public-plan-price", plan);
      await expect(visiblePrice).toHaveAttribute("data-currency", price.currency);
      await expect(visiblePrice).toHaveAttribute("data-unit-amount", String(price.unitAmount));
      await expect(visiblePrice).toHaveAttribute("data-interval", price.interval);
      await expect(visiblePrice).toHaveAttribute("data-interval-count", String(price.intervalCount));
      await expect(visiblePrice).toHaveAttribute("data-tax-behavior", price.taxBehavior);
    }
  },
};

export const SP: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

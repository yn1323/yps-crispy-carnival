import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ORGANIZATION_PLAN_LIMITS, type OrganizationPlanLimits } from "@/convex/organizationBilling/planLimits";
import { PricingSite } from ".";

const meta = {
  title: "Features/PricingSite",
  component: PricingSite,
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof PricingSite>;

export default meta;
type Story = StoryObj<typeof meta>;

async function expectPlanLimits(card: HTMLElement | null, limits: OrganizationPlanLimits) {
  await expect(card).not.toBeNull();
  if (!card) return;

  const plan = within(card);
  await expect(plan.getByText(`利用人数 ${limits.maxPeople}名まで`)).toBeInTheDocument();
  await expect(plan.getByText(`稼働店舗 ${limits.maxActiveShops}店舗まで`)).toBeInTheDocument();
  await expect(plan.getByText(`有効な管理者 ${limits.maxActiveManagers}名まで`)).toBeInTheDocument();
}

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const PublishedPlanContract: Story = {
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("複数の組織を作成")).toBeInTheDocument();
    await expect(canvas.getByText("店舗と管理者を追加")).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "組織ごとに利用できるプラン" })).toBeInTheDocument();
    await expect(canvas.getByText("Free")).toBeInTheDocument();
    await expect(canvas.getByText("Pro")).toBeInTheDocument();
    await expect(canvas.getAllByText("Business")).toHaveLength(2);
    await expect(canvas.getAllByText("料金は契約画面で確認")).toHaveLength(2);

    await expectPlanLimits(canvas.getByRole("heading", { name: "Free" }).parentElement, ORGANIZATION_PLAN_LIMITS.free);
    await expectPlanLimits(canvas.getByRole("heading", { name: "Pro" }).parentElement, ORGANIZATION_PLAN_LIMITS.pro);
    const businessHeadings = canvas.getAllByRole("heading", { name: "Business" });
    await expectPlanLimits(businessHeadings[0]?.parentElement ?? null, ORGANIZATION_PLAN_LIMITS.business);
    await expectPlanLimits(businessHeadings[1]?.parentElement ?? null, ORGANIZATION_PLAN_LIMITS.business);
    await expect(canvas.queryByText(/未公開|公開範囲/)).not.toBeInTheDocument();
  },
};

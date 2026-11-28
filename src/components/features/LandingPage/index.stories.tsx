import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "@/src/domains/publicPricing/fixture";
import { LandingPage } from ".";

const meta = {
  title: "Features/LandingPage",
  component: LandingPage,
  args: {
    prices: PUBLIC_PLAN_PRICE_FIXTURE,
  },
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 最初の画面と流れのあとの登録sectionは体験デモを別タブで開き、基本の使い方は下部の登録sectionから開く。
    const demoLinks = canvas.getAllByRole("link", { name: "デモを試す（別タブで開きます）" });
    await expect(demoLinks).toHaveLength(2);
    for (const link of demoLinks) {
      await expect(link).toHaveAttribute("href", "/demo/simple");
      await expect(link).toHaveAttribute("target", "_blank");
    }
    await expect(canvas.getByRole("link", { name: "基本の使い方を見る" })).toHaveAttribute(
      "href",
      "/help/scenarios/shift-management",
    );
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

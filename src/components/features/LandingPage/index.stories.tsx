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
    // 最初の画面の2つ目のボタンは体験デモを別タブで開き、基本の使い方は下部の登録sectionから開く。
    const demoLink = canvas.getByRole("link", { name: "デモを試す（別タブで開きます）" });
    await expect(demoLink).toHaveAttribute("href", "/demo/simple");
    await expect(demoLink).toHaveAttribute("target", "_blank");
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

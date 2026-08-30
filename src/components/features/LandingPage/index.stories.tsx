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
    const basicHelpLinks = canvas.getAllByRole("link", { name: "基本の使い方を見る" });

    await expect(basicHelpLinks).toHaveLength(2);
    for (const link of basicHelpLinks) {
      await expect(link).toHaveAttribute("href", "/help");
    }
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

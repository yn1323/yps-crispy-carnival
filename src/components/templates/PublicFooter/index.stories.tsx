import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { PublicFooter } from ".";

const meta = {
  title: "Shared/PublicFooter",
  component: PublicFooter,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PublicFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "機能一覧" })).toHaveAttribute("href", "/features");
    await expect(canvas.getByRole("link", { name: "活用例" })).toHaveAttribute("href", "/#use-cases");
    await expect(canvas.getByRole("link", { name: "料金" })).toHaveAttribute("href", "/#pricing");
    await expect(canvas.getByRole("link", { name: "ヘルプ・使い方" })).toHaveAttribute("href", "/help");
    await expect(canvas.getByRole("link", { name: "お役立ち記事" })).toHaveAttribute("href", "/articles");
    await expect(canvas.getByRole("link", { name: "特定商取引法に基づく表記" })).toHaveAttribute(
      "href",
      "/commercial-transactions",
    );
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { FaqArticlesSection } from ".";

const meta = {
  title: "Features/LandingPage/FaqArticlesSection",
  component: FaqArticlesSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FaqArticlesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const HelpCenterContent: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "利用を始めるとき、最初に何をしますか？" }));

    const answer = await canvas.findByText(
      "初回セットアップ後は、まず管理者自身で募集作成、希望提出、シフト表確認までを試し、その後スタッフを追加します。",
    );
    await waitFor(async () => {
      await expect(answer).toBeVisible();
    });
    await expect(canvas.getByRole("link", { name: "この回答をヘルプで見る" })).toHaveAttribute(
      "href",
      "/help#first-steps",
    );
    await expect(canvas.getByRole("link", { name: "ヘルプを見る" })).toHaveAttribute("href", "/help");
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { landingFaqs } from "@/src/components/features/HelpCenter/helpMeta";
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
    const firstStepsFaq = landingFaqs.find(({ href }) => href === "/help/tasks/getting-started#first-steps");
    if (!firstStepsFaq) throw new Error("Landing Page Storyにはfirst-steps FAQが必要です");

    await userEvent.click(canvas.getByRole("button", { name: firstStepsFaq.q }));

    const answer = await canvas.findByRole("region", { name: firstStepsFaq.q });
    await waitFor(async () => {
      await expect(answer).toBeVisible();
    });
    await expect(within(answer).getByRole("link", { name: "この回答をヘルプで見る" })).toHaveAttribute(
      "href",
      firstStepsFaq.href,
    );
    await expect(canvas.getByRole("link", { name: "ヘルプを見る" })).toHaveAttribute("href", "/help");
  },
};

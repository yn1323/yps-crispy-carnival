import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { HelpGuide } from "./HelpGuide";
import { faqMetas } from "./helpMeta";

const meta = {
  title: "Features/HelpCenter/Guide",
  component: HelpGuide,
  args: {
    slug: "start-shift-management",
  },
  decorators: [
    (Story) => (
      <>
        <style>{`
          html[data-vrt="true"] header {
            position: static !important;
            inset-inline-start: auto !important;
            inset-inline-end: auto !important;
            top: auto !important;
          }

          html[data-vrt="true"] main {
            padding-top: 0 !important;
          }

          html[data-vrt="true"] nav[aria-label="この使い方の目次"] {
            position: static !important;
            top: auto !important;
          }
        `}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstStepsFaq = faqMetas.find(({ id }) => id === "first-steps");
    if (!firstStepsFaq) throw new Error("Guide Storyにはfirst-steps FAQが必要です");

    await expect(
      await canvas.findByRole("heading", { level: 1, name: "最初のシフト募集を始める" }, { timeout: 10_000 }),
    ).toBeVisible();
    await expect(canvas.getAllByRole("link", { name: "ヘルプ" })[0]).toHaveAttribute("href", "/help");
    await expect(canvas.getAllByRole("navigation", { name: "この使い方の目次" }).length).toBeGreaterThan(0);
    await expect(canvas.getByRole("link", { name: firstStepsFaq.title })).toHaveAttribute("href", firstStepsFaq.href);
    await expect(canvas.getByRole("link", { name: /スタッフを追加する/ })).toHaveAttribute("href", "/help/add-staff");
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole("heading", { level: 1, name: "最初のシフト募集を始める" }, { timeout: 10_000 }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/初回セットアップ後、管理者自身でシフト募集の作成から希望シフトの提出/),
    ).toBeVisible();
  },
};

export const NotFound: Story = {
  args: {
    slug: "not-found-guide",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { level: 1, name: "ヘルプが見つかりません" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "ヘルプへ戻る" })).toHaveAttribute("href", "/help");
  },
};

export const RelatedFromIncomingRelation: Story = {
  args: {
    slug: "check-notification-history",
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const recruitmentNotificationFaq = faqMetas.find(({ id }) => id === "recruitment-notification-timing");
    if (!recruitmentNotificationFaq) {
      throw new Error("Guide Storyにはrecruitment-notification-timing FAQが必要です");
    }

    await expect(
      await canvas.findByRole("link", { name: recruitmentNotificationFaq.title }, { timeout: 10_000 }),
    ).toHaveAttribute("href", recruitmentNotificationFaq.href);
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { HowToSite } from ".";
import { helpArticles } from "./helpContent";

const layoutArticleSlugs = new Set([
  "shift-workflow",
  "submission-pattern-differences",
  "add-staff",
  "automatic-reminder",
  "assignment-warnings-and-errors",
  "delete-recruitment",
  "submission-link-unavailable",
  "resend-failed-notifications",
  "notification-channel",
]);

const layoutArticles = helpArticles.filter((article) => layoutArticleSlugs.has(article.slug));

const meta = {
  title: "Features/HowToSite/Page",
  component: HowToSite,
  args: {
    articles: layoutArticles,
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

          html[data-vrt="true"] aside[aria-label="使い方・ヘルプの目次"] {
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
    screenshot: { fullPage: false },
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HowToSite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

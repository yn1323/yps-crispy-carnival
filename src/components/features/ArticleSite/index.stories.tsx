import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCategoryPage, ArticleListPage, ArticlePage } from ".";

const meta = {
  title: "Features/ArticleSite/ArticlePage",
  component: ArticlePage,
  decorators: [
    (Story) => (
      <>
        <style>{`
          /* full-page VRT stitches viewport captures, so fixed/sticky elements must not follow each tile. */
          html[data-vrt="true"] header {
            position: static !important;
            inset-inline-start: auto !important;
            inset-inline-end: auto !important;
            top: auto !important;
          }

          html[data-vrt="true"] main {
            padding-top: 0 !important;
          }

          html[data-vrt="true"] aside[aria-label="この記事の目次"] {
            position: static !important;
            top: auto !important;
          }
        `}</style>
        <Story />
      </>
    ),
  ],
  args: {
    slug: "shift-type-request-guide",
  },
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof ArticlePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const List: Story = {
  render: () => <ArticleListPage />,
};

export const Category: Story = {
  args: {
    categorySlug: "shift-request",
  },
  render: (args) => <ArticleCategoryPage categorySlug={args.categorySlug} />,
};

export const CategoryMobile: Story = {
  args: {
    categorySlug: "shift-request",
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  render: (args) => <ArticleCategoryPage categorySlug={args.categorySlug} />,
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCategoryPage, ArticleListPage, ArticlePage } from ".";

const meta = {
  title: "Features/ArticleSite/ArticlePage",
  component: ArticlePage,
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

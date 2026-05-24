import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArticleCategoryPage, ArticleListPage, ArticlePage, articles, categories } from ".";

const meta = {
  title: "Mock/ArticleSite",
  component: ArticleListPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ArticleListPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const primaryArticleSlug = articles.find((article) => article.meta.featured)?.meta.slug ?? articles[0]?.meta.slug;
const primaryCategorySlug = categories[0]?.meta.slug;

export const List: Story = {
  render: () => <ArticleListPage />,
};

export const Article: Story = {
  render: () => <ArticlePage slug={primaryArticleSlug} />,
};

export const Category: Story = {
  render: () => <ArticleCategoryPage categorySlug={primaryCategorySlug} />,
};

export const MobileList: Story = {
  render: () => <ArticleListPage />,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const MobileArticle: Story = {
  render: () => <ArticlePage slug={primaryArticleSlug} />,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const MobileCategory: Story = {
  render: () => <ArticleCategoryPage categorySlug={primaryCategorySlug} />,
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const NotFound: Story = {
  render: () => <ArticlePage slug="missing-article" />,
};

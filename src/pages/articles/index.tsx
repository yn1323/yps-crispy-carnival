import {
  ArticleCategoryPage as ArticleCategoryFeature,
  ArticlePage as ArticleFeature,
  ArticleListPage as ArticleListFeature,
} from "@/src/components/features/ArticleSite";

export function ArticleListPage() {
  return <ArticleListFeature />;
}

export function ArticlePage({ slug }: { slug: string }) {
  return <ArticleFeature slug={slug} />;
}

export function ArticleCategoryPage({ categorySlug }: { categorySlug: string }) {
  return <ArticleCategoryFeature categorySlug={categorySlug} />;
}

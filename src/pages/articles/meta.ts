import {
  createArticleBreadcrumbJsonLd,
  createArticleJsonLd,
  createCategoryBreadcrumbJsonLd,
  getArticleMeta,
  getArticleOgpImagePath,
  getCategoryMeta,
  sitePage,
} from "@/src/components/features/ArticleSite/articleMeta";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildArticleListPageHead() {
  return {
    links: buildLinks({ canonical: "/articles" }),
    meta: buildMeta({
      title: sitePage.title,
      description: sitePage.description,
      canonical: "/articles",
    }),
  };
}

export function buildArticlePageHead(slug: string) {
  const article = getArticleMeta(slug);

  if (!article) {
    return {
      meta: buildMeta({ title: "記事が見つかりません", noindex: true }),
    };
  }

  return {
    links: buildLinks({ canonical: article.canonicalPath }),
    meta: [
      ...buildMeta({
        title: article.ogTitle,
        description: article.ogDescription,
        canonical: article.canonicalPath,
        ogType: "article",
        ogImage: { path: getArticleOgpImagePath(article.slug), alt: article.title },
      }),
      ...jsonLdMeta(createArticleJsonLd(article)),
      ...jsonLdMeta(createArticleBreadcrumbJsonLd(article)),
    ],
  };
}

export function buildArticleCategoryPageHead(categorySlug: string) {
  const category = getCategoryMeta(categorySlug);

  if (!category) {
    return {
      meta: buildMeta({ title: "カテゴリが見つかりません", noindex: true }),
    };
  }

  const canonical = `/articles/categories/${category.slug}`;
  return {
    links: buildLinks({ canonical }),
    meta: [
      ...buildMeta({
        title: `${category.title}｜シフト作成ガイド`,
        description: category.description,
        canonical,
      }),
      ...jsonLdMeta(createCategoryBreadcrumbJsonLd(category)),
    ],
  };
}

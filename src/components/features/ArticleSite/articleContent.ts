import { type MarkdownBlock, parseMarkdownBlocks, parseMarkdownDocument } from "@/src/helpers/markdown";
import {
  type ArticleMetadata,
  type CategoryMetadata,
  createImageSrcResolver,
  parseArticleMetadata,
  parseCategoryMetadata,
  resolveArticleSlug,
} from "./articleMeta";

/**
 * 記事サイトの「本文」層。`?raw` で Markdown 本文まで eager import するため、記事詳細・カテゴリ詳細を
 * 描画するコード分割済みコンポーネント（`ArticleSite/index.tsx`）からのみ import すること。
 * ルートの `head()` や LP など公開ページの入口からは、本文を含まない `articleMeta.ts` を使う。
 */

export type {
  MarkdownBlock,
  MarkdownImage,
  MarkdownImageAlign,
  MarkdownMediaAlign,
} from "@/src/helpers/markdown";
export type {
  ArticleHeroImage,
  ArticleJsonLd,
  ArticleMetadata,
  BreadcrumbJsonLd,
  CategoryMetadata,
  ConcernContent,
  SitePageMetadata,
} from "./articleMeta";
export {
  concerns,
  createArticleBreadcrumbJsonLd,
  createArticleJsonLd,
  createCategoryBreadcrumbJsonLd,
  getArticleOgpImagePath,
  parseSitePageMarkdown,
  sitePage,
} from "./articleMeta";

export type ArticleContent = {
  meta: ArticleMetadata;
  blocks: MarkdownBlock[];
  toc: { id: string; text: string }[];
};

export type CategoryContent = {
  meta: CategoryMetadata;
  blocks: MarkdownBlock[];
};

const categoryModules = import.meta.glob<string>("./content/categories/*/index.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const articleModules = import.meta.glob<string>("./content/articles/*/index.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const categories = Object.entries(categoryModules)
  .map(([path, source]) => {
    const slug = path.match(/\.\/content\/categories\/([^/]+)\/index\.md$/)?.[1] ?? path;
    return parseCategoryMarkdown(source, slug, path);
  })
  .sort((a, b) => a.meta.title.localeCompare(b.meta.title, "ja"));

export const articles = Object.entries(articleModules)
  .map(([path, source]) => {
    const slug = path.match(/\.\/content\/articles\/([^/]+)\/index\.md$/)?.[1] ?? path;
    return parseArticleMarkdown(source, slug, path);
  })
  .sort((a, b) => b.meta.publishedAt.localeCompare(a.meta.publishedAt));

export function getArticle(slug?: string): ArticleContent | undefined {
  if (!slug) {
    return articles.find((article) => article.meta.featured);
  }

  const resolvedSlug = resolveArticleSlug(slug);
  return articles.find((article) => article.meta.slug === resolvedSlug);
}

export function getCategory(categorySlug?: string): CategoryContent | undefined {
  return categorySlug ? categories.find((category) => category.meta.slug === categorySlug) : categories[0];
}

export function getArticlesByCategory(categorySlug: string): ArticleContent[] {
  return articles.filter((article) => article.meta.categorySlug === categorySlug);
}

export function getRelatedArticles(article: ArticleContent, limit = 3): ArticleContent[] {
  const selected = article.meta.relatedSlugs
    .map((slug) => getArticle(slug))
    .filter((candidate): candidate is ArticleContent => Boolean(candidate));

  if (selected.length >= limit) {
    return selected.slice(0, limit);
  }

  const fallback = getArticlesByCategory(article.meta.categorySlug).filter(
    (candidate) => candidate.meta.slug !== article.meta.slug,
  );

  return [...selected, ...fallback.filter((candidate) => !selected.includes(candidate))].slice(0, limit);
}

export function getRepresentativeArticle(category: CategoryContent | undefined): ArticleContent | undefined {
  if (!category) {
    return undefined;
  }

  return getArticle(category.meta.representativeSlug) ?? getArticlesByCategory(category.meta.slug)[0];
}

export function parseCategoryMarkdown(source: string, slug: string, documentPath?: string): CategoryContent {
  const meta = parseCategoryMetadata(source, slug);
  const { bodySource } = parseMarkdownDocument(source, slug);

  return {
    meta,
    blocks: parseMarkdownBlocks(bodySource, { resolveImageSrc: createImageSrcResolver(documentPath) }),
  };
}

export function parseArticleMarkdown(source: string, slug: string, documentPath?: string): ArticleContent {
  const meta = parseArticleMetadata(source, slug, documentPath);
  const { bodySource } = parseMarkdownDocument(source, slug);

  const blocks = parseMarkdownBlocks(bodySource, { resolveImageSrc: createImageSrcResolver(documentPath) });
  const toc = blocks
    .filter(
      (block): block is Extract<MarkdownBlock, { type: "heading" }> => block.type === "heading" && block.level === 2,
    )
    .map((block) => ({ id: block.id, text: block.text }));

  return { meta, blocks, toc };
}

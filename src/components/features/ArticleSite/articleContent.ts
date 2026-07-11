import type { MdxComponent, MdxTocItem } from "@/src/helpers/mdx";
import {
  type ArticleMetadata,
  articleMetas,
  type CategoryMetadata,
  createImageSrcResolver,
  resolveArticleSlug,
} from "./articleMeta";

/**
 * 記事サイトの「本文」層。`?mdx-component` で MDX 本文コンポーネントまで eager import するため、
 * 記事詳細を描画するコード分割済みコンポーネント（`ArticleSite/index.tsx`）からのみ import すること。
 * ルートの `head()` や LP など公開ページの入口からは、本文を含まない `articleMeta.ts` を使う。
 */

export type ArticleContent = {
  meta: ArticleMetadata;
  Content: MdxComponent;
  toc: MdxTocItem[];
  /** 本文・heroImageの相対画像パスをバンドル済みURLへ解決する */
  resolveImageSrc: (src: string) => string;
};

const articleComponentModules = import.meta.glob<MdxComponent>("./content/articles/*/index.mdx", {
  eager: true,
  query: "?mdx-component",
  import: "default",
});

// 目次はビルド時に抽出済み（vite/mdxPlugin.ts の `?mdx-toc`）。生ソースはバンドルに含めない。
const articleTocModules = import.meta.glob<MdxTocItem[]>("./content/articles/*/index.mdx", {
  eager: true,
  query: "?mdx-toc",
  import: "default",
});

export const articles = Object.entries(articleComponentModules)
  .map(([path, Content]) => {
    const slug = path.match(/\.\/content\/articles\/([^/]+)\/index\.mdx$/)?.[1] ?? path;

    // frontmatterのパースはメタデータ層（articleMeta.ts）に一本化し、slugで突き合わせる
    const meta = articleMetas.find((candidate) => candidate.slug === slug);
    if (!meta) {
      throw new Error(`記事 "${slug}" のメタデータが見つかりません`);
    }

    const toc = articleTocModules[path];
    if (toc === undefined) {
      throw new Error(`記事 "${slug}" の目次が見つかりません`);
    }

    return {
      meta,
      Content,
      toc,
      resolveImageSrc: createImageSrcResolver(path),
    };
  })
  .sort((a, b) => b.meta.publishedAt.localeCompare(a.meta.publishedAt));

export function getArticle(slug?: string): ArticleContent | undefined {
  if (!slug) {
    return articles.find((article) => article.meta.featured);
  }

  const resolvedSlug = resolveArticleSlug(slug);
  return articles.find((article) => article.meta.slug === resolvedSlug);
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

export function getRepresentativeArticle(category: CategoryMetadata | undefined): ArticleContent | undefined {
  if (!category) {
    return undefined;
  }

  return getArticle(category.representativeSlug) ?? getArticlesByCategory(category.slug)[0];
}

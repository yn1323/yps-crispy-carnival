import { createMdxImageSrcResolver, resolveMdxImageSrc } from "@/src/lib/mdx";
import { SITE_URL } from "@/src/lib/seo";
import { resolveArticleSlug } from "./articleAliases";
import {
  type ArticleMetadata,
  type CategoryMetadata,
  parseArticleMetadata,
  parseCategoryMetadata,
  parseSitePageFrontmatter,
} from "./articleFrontmatter";

export { articleSlugAliases, resolveArticleSlug } from "./articleAliases";
export {
  type ArticleHeroImage,
  type ArticleMetadata,
  type CategoryMetadata,
  parseArticleMetadata,
  parseCategoryMetadata,
  parseSitePageFrontmatter,
  type SitePageMetadata,
} from "./articleFrontmatter";

/**
 * 記事サイトの「メタデータ」層。
 *
 * ここは frontmatter だけを `?mdx-frontmatter`（vite/mdxPlugin.ts）で eager import するため、
 * 記事本文（MDX body）をバンドルに含めない。ルートの `head()` や LP の記事プレビューなど、
 * エントリー/公開ページ側から参照される軽量な入口として使う。本文（Content/toc）が必要な描画は
 * `articleContent.ts`（コード分割されたページコンポーネントからのみ import）で扱う。
 */

export type ConcernContent = {
  slug: string;
  title: string;
  description: string;
  href: string;
  representativeSlug: string;
};

export type ArticleJsonLd = {
  "@context": "https://schema.org";
  "@type": "BlogPosting";
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified: string;
  author: {
    "@type": "Organization";
    name: string;
  };
  publisher: {
    "@type": "Organization";
    name: string;
    logo: {
      "@type": "ImageObject";
      url: string;
    };
  };
  mainEntityOfPage: string;
};

export type BreadcrumbJsonLd = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    item?: string;
  }[];
};

// frontmatter だけをYAMLパース済みオブジェクトとして受け取る（vite/mdxPlugin.ts）。本文は含まれない。
// `_` 始まりのファイル・ディレクトリは下書きとして扱い、公開対象から除外する。
const pageFrontmatterModules = import.meta.glob<unknown>(["./content/pages/*.mdx", "!./content/pages/_*.mdx"], {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const categoryFrontmatterModules = import.meta.glob<unknown>(
  ["./content/categories/*/index.mdx", "!./content/categories/_*/index.mdx"],
  {
    eager: true,
    query: "?mdx-frontmatter",
    import: "default",
  },
);

const articleFrontmatterModules = import.meta.glob<unknown>(
  ["./content/articles/*/index.mdx", "!./content/articles/_*/index.mdx"],
  {
    eager: true,
    query: "?mdx-frontmatter",
    import: "default",
  },
);

// 画像は URL 文字列のみ（`?url`）なので軽量。heroImage・本文画像の解決で共有する。
const imageModules = import.meta.glob<string>(
  ["./content/**/*.{avif,gif,jpeg,jpg,png,svg,webp}", "!./content/articles/_*/**", "!./content/categories/_*/**"],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

export const sitePage = parseSitePageFrontmatter(pageFrontmatterModules["./content/pages/articles.mdx"], "articles");

export const categoryMetas = Object.entries(categoryFrontmatterModules)
  .map(([path, frontmatter]) => {
    const slug = path.match(/\.\/content\/categories\/([^/]+)\/index\.mdx$/)?.[1] ?? path;
    return parseCategoryMetadata(frontmatter, slug);
  })
  .sort((a, b) => a.title.localeCompare(b.title, "ja"));

export const articleMetas = Object.entries(articleFrontmatterModules)
  .map(([path, frontmatter]) => {
    const slug = path.match(/\.\/content\/articles\/([^/]+)\/index\.mdx$/)?.[1] ?? path;
    return parseArticleMetadata(frontmatter, slug, createImageSrcResolver(path));
  })
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export const concerns = sitePage.concernSlugs
  .map((slug) => getCategoryMeta(slug))
  .filter((category): category is CategoryMetadata => Boolean(category))
  .map<ConcernContent>((category) => ({
    slug: category.slug,
    title: category.title,
    description: category.description,
    href: `/articles/categories/${category.slug}`,
    representativeSlug: category.representativeSlug,
  }));

export function getArticleMeta(slug?: string): ArticleMetadata | undefined {
  if (!slug) {
    return articleMetas.find((article) => article.featured);
  }
  const resolvedSlug = resolveArticleSlug(slug);
  return articleMetas.find((article) => article.slug === resolvedSlug);
}

export function getCategoryMeta(categorySlug?: string): CategoryMetadata | undefined {
  return categorySlug ? categoryMetas.find((category) => category.slug === categorySlug) : categoryMetas[0];
}

export function getArticleMetasByCategory(categorySlug: string): ArticleMetadata[] {
  return articleMetas.filter((article) => article.categorySlug === categorySlug);
}

/** 記事別OGP画像のサイトルート相対パス。`pnpm ogp:articles` が同じ場所に生成する。 */
export function getArticleOgpImagePath(slug: string): string {
  return `/ogp/articles/${slug}.png`;
}

export function createArticleJsonLd(meta: ArticleMetadata): ArticleJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.ogTitle,
    description: meta.ogDescription,
    image: `${SITE_URL}${getArticleOgpImagePath(meta.slug)}`,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    author: {
      "@type": "Organization",
      name: meta.author,
    },
    publisher: {
      "@type": "Organization",
      name: "シフトリ",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo512.png`,
      },
    },
    mainEntityOfPage: `${SITE_URL}${meta.canonicalPath}`,
  };
}

/** パンくずの先頭（記事一覧トップ）。UIの `Breadcrumbs` と同じ並びを構造化データに写す */
function articlesRootBreadcrumbItem(): BreadcrumbJsonLd["itemListElement"][number] {
  return { "@type": "ListItem", position: 1, name: sitePage.breadcrumbLabel, item: `${SITE_URL}/articles` };
}

export function createArticleBreadcrumbJsonLd(meta: ArticleMetadata): BreadcrumbJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      articlesRootBreadcrumbItem(),
      {
        "@type": "ListItem",
        position: 2,
        name: meta.categoryLabel,
        item: `${SITE_URL}/articles/categories/${meta.categorySlug}`,
      },
      { "@type": "ListItem", position: 3, name: meta.title },
    ],
  };
}

export function createCategoryBreadcrumbJsonLd(meta: CategoryMetadata): BreadcrumbJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [articlesRootBreadcrumbItem(), { "@type": "ListItem", position: 2, name: meta.breadcrumbLabel }],
  };
}

export function createImageSrcResolver(documentPath?: string): (src: string) => string {
  return createMdxImageSrcResolver(documentPath, imageModules);
}

export function resolveMarkdownImageSrc(src: string, documentPath?: string): string {
  return resolveMdxImageSrc(src, documentPath, imageModules);
}

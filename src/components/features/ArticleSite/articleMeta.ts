import {
  parseBoundedPositiveInteger,
  parseMarkdownDocument,
  parsePositiveInteger,
  splitList,
} from "@/src/helpers/markdown";
import { SITE_URL } from "@/src/helpers/seo";

/**
 * 記事サイトの「メタデータ」層。
 *
 * ここは frontmatter だけを `?frontmatter` で eager import するため、記事本文（Markdown body）を
 * バンドルに含めない。ルートの `head()` や LP の記事プレビューなど、エントリー/公開ページ側から
 * 参照される軽量な入口として使う。本文（blocks/toc）が必要な描画は `articleContent.ts`（コード分割
 * されたページコンポーネントからのみ import）で扱う。
 */

export type SitePageMetadata = {
  title: string;
  description: string;
  breadcrumbLabel: string;
  concernTitle: string;
  latestTitle: string;
  ctaTitle: string;
  ctaDescription: string;
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
  concernSlugs: string[];
  landingPreviewTitle: string;
  landingPreviewDescription: string;
  landingPreviewLimit: number;
  landingPreviewLinkLabel: string;
};

export type CategoryMetadata = {
  slug: string;
  title: string;
  description: string;
  breadcrumbLabel: string;
  pointTitle: string;
  pointDescription: string;
  concerns: string[];
  representativeSlug: string;
  relatedConcernSlugs: string[];
  ctaTitle: string;
  ctaDescription: string;
};

export type ArticleHeroImage = {
  src: string;
  alt: string;
  width: number;
};

export type ArticleMetadata = {
  slug: string;
  title: string;
  description: string;
  heroImage?: ArticleHeroImage;
  publishedAt: string;
  updatedAt?: string;
  categorySlug: string;
  categoryLabel: string;
  author: string;
  readingMinutes: number;
  keywords: string[];
  relatedSlugs: string[];
  featured: boolean;
  canonicalPath: string;
  ogTitle: string;
  ogDescription: string;
};

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

// frontmatter だけを含む擬似 md ソース（vite/markdownFrontmatterPlugin.ts が生成）。本文は含まれない。
const pageFrontmatterModules = import.meta.glob<string>("./content/pages/*.md", {
  eager: true,
  query: "?frontmatter",
  import: "default",
});

const categoryFrontmatterModules = import.meta.glob<string>("./content/categories/*/index.md", {
  eager: true,
  query: "?frontmatter",
  import: "default",
});

const articleFrontmatterModules = import.meta.glob<string>("./content/articles/*/index.md", {
  eager: true,
  query: "?frontmatter",
  import: "default",
});

// 画像は URL 文字列のみ（`?url`）なので軽量。heroImage・本文画像の解決で共有する。
const imageModules = import.meta.glob<string>("./content/**/*.{avif,gif,jpeg,jpg,png,svg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const pageRequiredFields = [
  "title",
  "description",
  "breadcrumbLabel",
  "concernTitle",
  "latestTitle",
  "ctaTitle",
  "ctaDescription",
  "ctaPrimaryLabel",
  "ctaPrimaryHref",
  "ctaSecondaryLabel",
  "ctaSecondaryHref",
] as const;

const categoryRequiredFields = [
  "slug",
  "title",
  "description",
  "breadcrumbLabel",
  "pointTitle",
  "pointDescription",
  "concerns",
  "representativeSlug",
  "ctaTitle",
  "ctaDescription",
] as const;

const articleRequiredFields = [
  "title",
  "description",
  "publishedAt",
  "categorySlug",
  "categoryLabel",
  "author",
  "readingMinutes",
  "canonicalPath",
  "ogTitle",
  "ogDescription",
] as const;

const ARTICLE_HERO_IMAGE_DEFAULT_WIDTH = 320;
const ARTICLE_HERO_IMAGE_MIN_WIDTH = 240;
const ARTICLE_HERO_IMAGE_MAX_WIDTH = 360;

export const sitePage = parseSitePageMarkdown(pageFrontmatterModules["./content/pages/articles.md"] ?? "", "articles");

export const categoryMetas = Object.entries(categoryFrontmatterModules)
  .map(([path, source]) => {
    const slug = path.match(/\.\/content\/categories\/([^/]+)\/index\.md$/)?.[1] ?? path;
    return parseCategoryMetadata(source, slug);
  })
  .sort((a, b) => a.title.localeCompare(b.title, "ja"));

export const articleMetas = Object.entries(articleFrontmatterModules)
  .map(([path, source]) => {
    const slug = path.match(/\.\/content\/articles\/([^/]+)\/index\.md$/)?.[1] ?? path;
    return parseArticleMetadata(source, slug, path);
  })
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export const articleSlugAliases = {
  "line-shift-collection-guide": "shiftori-line-workflow",
} as const;

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

/** slug の別名（旧slug）を解決する。 */
export function resolveArticleSlug(slug: string): string {
  return articleSlugAliases[slug as keyof typeof articleSlugAliases] ?? slug;
}

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

export function parseSitePageMarkdown(source: string, slug: string): SitePageMetadata {
  const { frontmatter } = parseMarkdownDocument(source, slug);
  ensureFields(frontmatter, pageRequiredFields, slug);

  return {
    title: frontmatter.title,
    description: frontmatter.description,
    breadcrumbLabel: frontmatter.breadcrumbLabel,
    concernTitle: frontmatter.concernTitle,
    latestTitle: frontmatter.latestTitle,
    ctaTitle: frontmatter.ctaTitle,
    ctaDescription: frontmatter.ctaDescription,
    ctaPrimaryLabel: frontmatter.ctaPrimaryLabel,
    ctaPrimaryHref: frontmatter.ctaPrimaryHref,
    ctaSecondaryLabel: frontmatter.ctaSecondaryLabel,
    ctaSecondaryHref: frontmatter.ctaSecondaryHref,
    concernSlugs: splitList(frontmatter.concernSlugs),
    landingPreviewTitle: frontmatter.landingPreviewTitle ?? "シフト作成のヒント",
    landingPreviewDescription:
      frontmatter.landingPreviewDescription ??
      "LINE回収やExcel転記など、シフト作成でつまずきやすいポイントを整理しています。",
    landingPreviewLimit: parsePositiveInteger(frontmatter.landingPreviewLimit, 3),
    landingPreviewLinkLabel: frontmatter.landingPreviewLinkLabel ?? "記事一覧を見る",
  };
}

export function parseCategoryMetadata(source: string, slug: string): CategoryMetadata {
  const { frontmatter } = parseMarkdownDocument(source, slug);
  ensureFields(frontmatter, categoryRequiredFields, slug);

  return {
    slug: frontmatter.slug,
    title: frontmatter.title,
    description: frontmatter.description,
    breadcrumbLabel: frontmatter.breadcrumbLabel,
    pointTitle: frontmatter.pointTitle,
    pointDescription: frontmatter.pointDescription,
    concerns: splitList(frontmatter.concerns),
    representativeSlug: frontmatter.representativeSlug,
    relatedConcernSlugs: splitList(frontmatter.relatedConcernSlugs),
    ctaTitle: frontmatter.ctaTitle,
    ctaDescription: frontmatter.ctaDescription,
  };
}

export function parseArticleMetadata(source: string, slug: string, documentPath?: string): ArticleMetadata {
  const { frontmatter } = parseMarkdownDocument(source, slug);
  ensureFields(frontmatter, articleRequiredFields, slug);

  return {
    slug,
    title: frontmatter.title,
    description: frontmatter.description,
    heroImage: parseArticleHeroImage(frontmatter, documentPath, slug),
    publishedAt: frontmatter.publishedAt,
    updatedAt: frontmatter.updatedAt || undefined,
    categorySlug: frontmatter.categorySlug,
    categoryLabel: frontmatter.categoryLabel,
    author: frontmatter.author,
    readingMinutes: Number(frontmatter.readingMinutes),
    keywords: splitList(frontmatter.keywords),
    relatedSlugs: splitList(frontmatter.relatedSlugs),
    featured: frontmatter.featured === "true",
    canonicalPath: frontmatter.canonicalPath,
    ogTitle: frontmatter.ogTitle,
    ogDescription: frontmatter.ogDescription,
  };
}

function parseArticleHeroImage(
  frontmatter: Record<string, string>,
  documentPath: string | undefined,
  slug: string,
): ArticleHeroImage | undefined {
  if (!frontmatter.heroImageSrc) {
    return undefined;
  }

  if (!frontmatter.heroImageAlt) {
    throw new Error(`記事 "${slug}" の heroImageSrc には heroImageAlt が必要です`);
  }

  return {
    src: resolveMarkdownImageSrc(frontmatter.heroImageSrc, documentPath),
    alt: frontmatter.heroImageAlt,
    width: parseBoundedPositiveInteger(
      frontmatter.heroImageWidth,
      ARTICLE_HERO_IMAGE_DEFAULT_WIDTH,
      ARTICLE_HERO_IMAGE_MIN_WIDTH,
      ARTICLE_HERO_IMAGE_MAX_WIDTH,
    ),
  };
}

function ensureFields<const T extends readonly string[]>(
  frontmatter: Record<string, string>,
  fields: T,
  slug: string,
): void {
  for (const field of fields) {
    if (!frontmatter[field]) {
      throw new Error(`記事 "${slug}" の frontmatter に ${field} がありません`);
    }
  }
}

export function createImageSrcResolver(documentPath?: string): (src: string) => string {
  return (src) => resolveMarkdownImageSrc(src, documentPath);
}

export function resolveMarkdownImageSrc(src: string, documentPath?: string): string {
  if (/^(https?:)?\/\//.test(src) || /^(data|blob):/.test(src) || src.startsWith("/")) {
    return src;
  }

  if (!documentPath) {
    return src;
  }

  const documentDirectory = documentPath.replace(/\/[^/]*$/, "");
  const normalizedPath = normalizeContentPath(`${documentDirectory}/${src}`);
  return imageModules[normalizedPath] ?? src;
}

function normalizeContentPath(path: string): string {
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return `./${segments.join("/")}`;
}

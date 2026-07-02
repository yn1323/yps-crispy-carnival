import {
  type MarkdownBlock,
  parseBoundedPositiveInteger,
  parseMarkdownBlocks,
  parseMarkdownDocument,
  parsePositiveInteger,
  splitList,
} from "@/src/helpers/markdown";
import { SITE_URL } from "@/src/helpers/seo";

export type {
  MarkdownBlock,
  MarkdownImage,
  MarkdownImageAlign,
  MarkdownMediaAlign,
} from "@/src/helpers/markdown";

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

export type ArticleHeroImage = {
  src: string;
  alt: string;
  width: number;
};

export type ArticleContent = {
  meta: ArticleMetadata;
  blocks: MarkdownBlock[];
  toc: { id: string; text: string }[];
};

export type CategoryContent = {
  meta: CategoryMetadata;
  blocks: MarkdownBlock[];
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

const pageModules = import.meta.glob<string>("./content/pages/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

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

export const sitePage = parseSitePageMarkdown(pageModules["./content/pages/articles.md"] ?? "", "articles");

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

const articleSlugAliases = {
  "line-shift-collection-guide": "shiftori-line-workflow",
} as const;

export const concerns = sitePage.concernSlugs
  .map((slug) => getCategory(slug))
  .filter((category): category is CategoryContent => Boolean(category))
  .map<ConcernContent>((category) => ({
    slug: category.meta.slug,
    title: category.meta.title,
    description: category.meta.description,
    href: `/articles/categories/${category.meta.slug}`,
    representativeSlug: category.meta.representativeSlug,
  }));

export function getArticle(slug?: string): ArticleContent | undefined {
  if (!slug) {
    return articles.find((article) => article.meta.featured);
  }

  const resolvedSlug = articleSlugAliases[slug as keyof typeof articleSlugAliases] ?? slug;
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

/** 記事別OGP画像のサイトルート相対パス。`pnpm ogp:articles` が同じ場所に生成する。 */
export function getArticleOgpImagePath(slug: string): string {
  return `/ogp/articles/${slug}.png`;
}

export function createArticleJsonLd(article: ArticleContent): ArticleJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.meta.ogTitle,
    description: article.meta.ogDescription,
    image: `${SITE_URL}${getArticleOgpImagePath(article.meta.slug)}`,
    datePublished: article.meta.publishedAt,
    dateModified: article.meta.updatedAt ?? article.meta.publishedAt,
    author: {
      "@type": "Organization",
      name: article.meta.author,
    },
    publisher: {
      "@type": "Organization",
      name: "シフトリ",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo512.png`,
      },
    },
    mainEntityOfPage: `${SITE_URL}${article.meta.canonicalPath}`,
  };
}

export function createArticleBreadcrumbJsonLd(article: ArticleContent): BreadcrumbJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: sitePage.breadcrumbLabel, item: `${SITE_URL}/articles` },
      {
        "@type": "ListItem",
        position: 2,
        name: article.meta.categoryLabel,
        item: `${SITE_URL}/articles/categories/${article.meta.categorySlug}`,
      },
      { "@type": "ListItem", position: 3, name: article.meta.title },
    ],
  };
}

export function createCategoryBreadcrumbJsonLd(category: CategoryContent): BreadcrumbJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: sitePage.breadcrumbLabel, item: `${SITE_URL}/articles` },
      { "@type": "ListItem", position: 2, name: category.meta.breadcrumbLabel },
    ],
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

export function parseCategoryMarkdown(source: string, slug: string, documentPath?: string): CategoryContent {
  const { frontmatter, bodySource } = parseMarkdownDocument(source, slug);
  ensureFields(frontmatter, categoryRequiredFields, slug);

  return {
    meta: {
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
    },
    blocks: parseMarkdownBlocks(bodySource, { resolveImageSrc: createImageSrcResolver(documentPath) }),
  };
}

export function parseArticleMarkdown(source: string, slug: string, documentPath?: string): ArticleContent {
  const { frontmatter, bodySource } = parseMarkdownDocument(source, slug);
  ensureFields(frontmatter, articleRequiredFields, slug);

  const meta: ArticleMetadata = {
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

  const blocks = parseMarkdownBlocks(bodySource, { resolveImageSrc: createImageSrcResolver(documentPath) });
  const toc = blocks
    .filter(
      (block): block is Extract<MarkdownBlock, { type: "heading" }> => block.type === "heading" && block.level === 2,
    )
    .map((block) => ({ id: block.id, text: block.text }));

  return { meta, blocks, toc };
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

function createImageSrcResolver(documentPath?: string): (src: string) => string {
  return (src) => resolveMarkdownImageSrc(src, documentPath);
}

function resolveMarkdownImageSrc(src: string, documentPath?: string): string {
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

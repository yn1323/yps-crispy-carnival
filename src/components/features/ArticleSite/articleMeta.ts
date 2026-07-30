import { z } from "zod";
import { SITE_URL } from "@/src/lib/seo";
import { resolveArticleSlug } from "./articleAliases";

export { articleSlugAliases, resolveArticleSlug } from "./articleAliases";

/**
 * 記事サイトの「メタデータ」層。
 *
 * ここは frontmatter だけを `?mdx-frontmatter`（vite/mdxPlugin.ts）で eager import するため、
 * 記事本文（MDX body）をバンドルに含めない。ルートの `head()` や LP の記事プレビューなど、
 * エントリー/公開ページ側から参照される軽量な入口として使う。本文（Content/toc）が必要な描画は
 * `articleContent.ts`（コード分割されたページコンポーネントからのみ import）で扱う。
 */

/** カンマ区切り文字列（"a, b" 形式）またはYAML配列をリストとして受け取る */
const listSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(splitList);

/** 必須リスト。空はエラーにする（旧実装の必須フィールド検証を維持） */
const requiredListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform(splitList)
  .refine((items) => items.length > 0, "1つ以上指定してください");

/** "YYYY-MM-DD"。frontmatterで引用符を忘れるとYAMLがDate型に変換しISO文字列化されるため、形式で弾く */
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式（引用符つき）で指定してください");

const sitePageSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  breadcrumbLabel: z.string().min(1),
  concernTitle: z.string().min(1),
  latestTitle: z.string().min(1),
  ctaTitle: z.string().min(1),
  ctaDescription: z.string().min(1),
  ctaPrimaryLabel: z.string().min(1),
  ctaPrimaryHref: z.string().min(1),
  ctaSecondaryLabel: z.string().min(1),
  ctaSecondaryHref: z.string().min(1),
  concernSlugs: listSchema,
  landingPreviewTitle: z.string().min(1).catch("シフト作成のヒント"),
  landingPreviewDescription: z
    .string()
    .min(1)
    .catch("LINE回収やExcel転記など、シフト作成でつまずきやすいポイントを整理しています。"),
  landingPreviewLimit: z.coerce.number().int().positive().catch(3),
  landingPreviewLinkLabel: z.string().min(1).catch("記事一覧を見る"),
});

const categorySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  breadcrumbLabel: z.string().min(1),
  pointTitle: z.string().min(1),
  pointDescription: z.string().min(1),
  concerns: requiredListSchema,
  representativeSlug: z.string().min(1),
  relatedConcernSlugs: listSchema,
  ctaTitle: z.string().min(1),
  ctaDescription: z.string().min(1),
});

const articleSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  heroImageSrc: z.string().min(1).optional(),
  heroImageAlt: z.string().min(1).optional(),
  heroImageWidth: z.coerce.number().optional(),
  publishedAt: dateStringSchema,
  updatedAt: z
    .union([z.literal(""), dateStringSchema])
    .optional()
    .transform((value) => value || undefined),
  categorySlug: z.string().min(1),
  categoryLabel: z.string().min(1),
  author: z.string().min(1),
  readingMinutes: z.coerce.number().int().positive(),
  keywords: listSchema,
  relatedSlugs: listSchema,
  featured: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
  canonicalPath: z.string().min(1),
  ogTitle: z.string().min(1),
  ogDescription: z.string().min(1),
});

export type SitePageMetadata = z.infer<typeof sitePageSchema>;
export type CategoryMetadata = z.infer<typeof categorySchema>;

export type ArticleHeroImage = {
  src: string;
  alt: string;
  width: number;
};

export type ArticleMetadata = Omit<
  z.infer<typeof articleSchema>,
  "heroImageSrc" | "heroImageAlt" | "heroImageWidth"
> & {
  slug: string;
  heroImage?: ArticleHeroImage;
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

const ARTICLE_HERO_IMAGE_DEFAULT_WIDTH = 320;
const ARTICLE_HERO_IMAGE_MIN_WIDTH = 240;
const ARTICLE_HERO_IMAGE_MAX_WIDTH = 360;

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
    return parseArticleMetadata(frontmatter, slug, path);
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

export function parseSitePageFrontmatter(frontmatter: unknown, slug: string): SitePageMetadata {
  const parsed = sitePageSchema.safeParse(frontmatter);
  if (!parsed.success) {
    throw new Error(`記事一覧トップ "${slug}" の frontmatter が正しくありません: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseCategoryMetadata(frontmatter: unknown, slug: string): CategoryMetadata {
  const parsed = categorySchema.safeParse(frontmatter);
  if (!parsed.success) {
    throw new Error(`カテゴリ "${slug}" の frontmatter が正しくありません: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseArticleMetadata(frontmatter: unknown, slug: string, documentPath?: string): ArticleMetadata {
  const parsed = articleSchema.safeParse(frontmatter);
  if (!parsed.success) {
    throw new Error(`記事 "${slug}" の frontmatter が正しくありません: ${parsed.error.message}`);
  }

  const { heroImageSrc, heroImageAlt, heroImageWidth, ...meta } = parsed.data;
  return {
    ...meta,
    slug,
    heroImage: parseArticleHeroImage({ heroImageSrc, heroImageAlt, heroImageWidth }, documentPath, slug),
  };
}

function parseArticleHeroImage(
  fields: { heroImageSrc?: string; heroImageAlt?: string; heroImageWidth?: number },
  documentPath: string | undefined,
  slug: string,
): ArticleHeroImage | undefined {
  if (!fields.heroImageSrc) {
    return undefined;
  }

  if (!fields.heroImageAlt) {
    throw new Error(`記事 "${slug}" の heroImageSrc には heroImageAlt が必要です`);
  }

  return {
    src: resolveMarkdownImageSrc(fields.heroImageSrc, documentPath),
    alt: fields.heroImageAlt,
    width: boundPositiveInteger(
      fields.heroImageWidth,
      ARTICLE_HERO_IMAGE_DEFAULT_WIDTH,
      ARTICLE_HERO_IMAGE_MIN_WIDTH,
      ARTICLE_HERO_IMAGE_MAX_WIDTH,
    ),
  };
}

function splitList(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return value
    .split(/[,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function boundPositiveInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  const base = value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
  return Math.min(Math.max(base, min), max);
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

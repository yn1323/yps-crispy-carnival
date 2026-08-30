import { z } from "zod";

/** カンマ区切り文字列（"a, b" 形式）またはYAML配列をリストとして受け取る。 */
const listSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(splitList);

/** 必須リスト。空はエラーにする（旧実装の必須フィールド検証を維持）。 */
const requiredListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform(splitList)
  .refine((items) => items.length > 0, "1つ以上指定してください");

/** "YYYY-MM-DD"。YAMLの暗黙型変換を避け、引用符付き文字列だけを受け付ける。 */
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式（引用符つき）で指定してください");

const sitePageSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  breadcrumbLabel: z.string().min(1),
  concernTitle: z.string().min(1),
  latestTitle: z.string().min(1),
  ctaTitle: z.string().min(1),
  ctaDescription: z.string().min(1),
  ctaSecondaryLabel: z.string().min(1),
  ctaSecondaryHref: z.string().min(1),
  concernSlugs: listSchema,
  landingPreviewTitle: z.string().min(1).catch("シフト作成のヒント"),
  landingPreviewDescription: z
    .string()
    .min(1)
    .catch("LINEでの回収やExcelへの転記など、シフト作成でつまずきやすいポイントを整理しています。"),
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

const ARTICLE_HERO_IMAGE_DEFAULT_WIDTH = 320;
const ARTICLE_HERO_IMAGE_MIN_WIDTH = 240;
const ARTICLE_HERO_IMAGE_MAX_WIDTH = 360;

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

/** BrowserとNodeの双方で使えるfrontmatter parser。画像URLの解決だけを呼び出し側から注入する。 */
export function parseArticleMetadata(
  frontmatter: unknown,
  slug: string,
  resolveImageSrc: (src: string) => string = (src) => src,
): ArticleMetadata {
  const parsed = articleSchema.safeParse(frontmatter);
  if (!parsed.success) {
    throw new Error(`記事 "${slug}" の frontmatter が正しくありません: ${parsed.error.message}`);
  }

  const { heroImageSrc, heroImageAlt, heroImageWidth, ...meta } = parsed.data;
  return {
    ...meta,
    slug,
    heroImage: parseArticleHeroImage({ heroImageSrc, heroImageAlt, heroImageWidth }, resolveImageSrc, slug),
  };
}

function parseArticleHeroImage(
  fields: { heroImageSrc?: string; heroImageAlt?: string; heroImageWidth?: number },
  resolveImageSrc: (src: string) => string,
  slug: string,
): ArticleHeroImage | undefined {
  if (!fields.heroImageSrc) {
    return undefined;
  }

  if (!fields.heroImageAlt) {
    throw new Error(`記事 "${slug}" で heroImageSrc を指定する場合は heroImageAlt も必要です`);
  }

  return {
    src: resolveImageSrc(fields.heroImageSrc),
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

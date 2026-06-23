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

export type MarkdownImageAlign = "left" | "center" | "right";
export type MarkdownMediaAlign = "left" | "right";

export type MarkdownImage = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  align: MarkdownImageAlign;
};

export type MarkdownBlock =
  | {
      type: "heading";
      level: 2 | 3;
      text: string;
      id: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "unorderedList";
      items: string[];
    }
  | {
      type: "orderedList";
      items: string[];
    }
  | {
      type: "blockquote";
      text: string;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    }
  | {
      type: "image";
      image: MarkdownImage;
    }
  | {
      type: "media";
      align: MarkdownMediaAlign;
      image: MarkdownImage;
      text: string;
    }
  | {
      type: "horizontalRule";
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
  datePublished: string;
  dateModified: string;
  author: {
    "@type": "Organization";
    name: string;
  };
  mainEntityOfPage: string;
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

export function createArticleJsonLd(article: ArticleContent): ArticleJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.meta.ogTitle,
    description: article.meta.ogDescription,
    datePublished: article.meta.publishedAt,
    dateModified: article.meta.updatedAt ?? article.meta.publishedAt,
    author: {
      "@type": "Organization",
      name: article.meta.author,
    },
    mainEntityOfPage: article.meta.canonicalPath,
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
    blocks: parseMarkdownBlocks(bodySource, documentPath),
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

  const blocks = parseMarkdownBlocks(bodySource, documentPath);
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

function parseMarkdownDocument(
  source: string,
  slug: string,
): { frontmatter: Record<string, string>; bodySource: string } {
  const normalizedSource = source.replace(/\r\n/g, "\n").trim();
  const frontmatterMatch = normalizedSource.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error(`記事 "${slug}" の frontmatter が見つかりません`);
  }

  const [, frontmatterSource, bodySource] = frontmatterMatch;
  return {
    frontmatter: parseFrontmatter(frontmatterSource),
    bodySource: bodySource ?? "",
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

function parseFrontmatter(source: string): Record<string, string> {
  return source.split("\n").reduce<Record<string, string>>((acc, line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      return acc;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    acc[key] = stripQuotes(value);
    return acc;
  }, {});
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[,、]/)
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBoundedPositiveInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = parsePositiveInteger(value, fallback);
  return Math.min(Math.max(parsed, min), max);
}

function parseMarkdownBlocks(source: string, documentPath?: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? "";

    if (!line.trim() || /^#\s+/.test(line)) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length === 2 ? 2 : 3;
      const text = headingMatch[2].trim();
      blocks.push({ type: "heading", level, text, id: toHeadingId(text) });
      index += 1;
      continue;
    }

    const media = parseMediaBlock(lines, index, documentPath);
    if (media) {
      blocks.push(media.block);
      index = media.nextIndex;
      continue;
    }
    if (/^:::\s+media(?:\s+.*)?$/.test(line.trim())) {
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\|.+\|$/.test((lines[index] ?? "").trim())) {
        tableLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      blocks.push(parseTable(tableLines));
      continue;
    }

    const image = parseImageLine(line, documentPath);
    if (image) {
      blocks.push({ type: "image", image });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, "").trim());
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trimEnd())) {
        items.push((lines[index] ?? "").replace(/^[-*]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "unorderedList", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trimEnd())) {
        items.push((lines[index] ?? "").replace(/^\d+\.\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "orderedList", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const currentLine = lines[index]?.trimEnd() ?? "";
      if (
        !currentLine.trim() ||
        /^#{1,3}\s+/.test(currentLine) ||
        /^:::\s+media(?:\s+.*)?$/.test(currentLine.trim()) ||
        isTableStart(lines, index) ||
        parseImageLine(currentLine, documentPath) ||
        /^(-{3,}|\*{3,})$/.test(currentLine.trim()) ||
        /^>\s?/.test(currentLine) ||
        /^[-*]\s+/.test(currentLine) ||
        /^\d+\.\s+/.test(currentLine)
      ) {
        break;
      }
      paragraphLines.push(currentLine.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

function parseMediaBlock(
  lines: string[],
  startIndex: number,
  documentPath?: string,
): { block: Extract<MarkdownBlock, { type: "media" }>; nextIndex: number } | undefined {
  const openingMatch = (lines[startIndex] ?? "").trim().match(/^:::\s+media(?:\s+(.+))?$/);
  if (!openingMatch) {
    return undefined;
  }

  const mediaAttributes = parseAttributeString(openingMatch[1] ?? "");
  const imageLines: MarkdownImage[] = [];
  const textLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !/^:::\s*$/.test((lines[index] ?? "").trim())) {
    const currentLine = lines[index]?.trimEnd() ?? "";
    const image = parseImageLine(currentLine, documentPath);

    if (image) {
      imageLines.push(image);
    } else if (currentLine.trim()) {
      textLines.push(currentLine.trim());
    }

    index += 1;
  }

  const image = imageLines[0];
  if (!image) {
    return undefined;
  }

  const align = parseMediaAlign(mediaAttributes.align, image.align === "left" ? "left" : "right");
  return {
    block: {
      type: "media",
      align,
      image: {
        ...image,
        width: parsePositiveInteger(mediaAttributes.width, image.width ?? 0) || image.width,
        align,
      },
      text: textLines.join("\n"),
    },
    nextIndex: index < lines.length ? index + 1 : index,
  };
}

function parseImageLine(line: string, documentPath?: string): MarkdownImage | undefined {
  const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)(?:\{([^}]*)\})?$/);
  if (!imageMatch) {
    return undefined;
  }

  const [, alt, src, caption, attributeSource] = imageMatch;
  const attributes = parseAttributeString(attributeSource ?? "");
  return {
    src: resolveMarkdownImageSrc(src, documentPath),
    alt: alt.trim(),
    caption: caption?.trim(),
    width: parsePositiveInteger(attributes.width, 0) || undefined,
    align: parseImageAlign(attributes.align, "center"),
  };
}

function parseAttributeString(source: string): Record<string, string> {
  return source.split(/\s+/).reduce<Record<string, string>>((acc, token) => {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) {
      return acc;
    }

    const key = token.slice(0, separatorIndex).trim();
    const value = token.slice(separatorIndex + 1).trim();
    if (key && value) {
      acc[key] = stripQuotes(value);
    }
    return acc;
  }, {});
}

function parseImageAlign(value: string | undefined, fallback: MarkdownImageAlign): MarkdownImageAlign {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }
  return fallback;
}

function parseMediaAlign(value: string | undefined, fallback: MarkdownMediaAlign): MarkdownMediaAlign {
  if (value === "left" || value === "right") {
    return value;
  }
  return fallback;
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

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  return /^\|.+\|$/.test(current) && /^\|[\s:\-|]+\|$/.test(next);
}

function parseTable(lines: string[]): Extract<MarkdownBlock, { type: "table" }> {
  const [headerLine, , ...rowLines] = lines;

  return {
    type: "table",
    headers: splitTableRow(headerLine ?? ""),
    rows: rowLines.map(splitTableRow),
  };
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function toHeadingId(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

  return normalized || "section";
}

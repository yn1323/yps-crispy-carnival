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

export const sitePage = parseSitePageMarkdown(pageModules["./content/pages/articles.md"] ?? "", "articles");

export const categories = Object.entries(categoryModules)
  .map(([path, source]) => {
    const slug = path.match(/\.\/content\/categories\/([^/]+)\/index\.md$/)?.[1] ?? path;
    return parseCategoryMarkdown(source, slug);
  })
  .sort((a, b) => a.meta.title.localeCompare(b.meta.title, "ja"));

export const articles = Object.entries(articleModules)
  .map(([path, source]) => {
    const slug = path.match(/\.\/content\/articles\/([^/]+)\/index\.md$/)?.[1] ?? path;
    return parseArticleMarkdown(source, slug);
  })
  .sort((a, b) => b.meta.publishedAt.localeCompare(a.meta.publishedAt));

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
  return slug
    ? articles.find((article) => article.meta.slug === slug)
    : articles.find((article) => article.meta.featured);
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
  };
}

export function parseCategoryMarkdown(source: string, slug: string): CategoryContent {
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
    blocks: parseMarkdownBlocks(bodySource),
  };
}

export function parseArticleMarkdown(source: string, slug: string): ArticleContent {
  const { frontmatter, bodySource } = parseMarkdownDocument(source, slug);
  ensureFields(frontmatter, articleRequiredFields, slug);

  const meta: ArticleMetadata = {
    slug,
    title: frontmatter.title,
    description: frontmatter.description,
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

  const blocks = parseMarkdownBlocks(bodySource);
  const toc = blocks
    .filter(
      (block): block is Extract<MarkdownBlock, { type: "heading" }> => block.type === "heading" && block.level === 2,
    )
    .map((block) => ({ id: block.id, text: block.text }));

  return { meta, blocks, toc };
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

function parseMarkdownBlocks(source: string): MarkdownBlock[] {
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

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\|.+\|$/.test((lines[index] ?? "").trim())) {
        tableLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      blocks.push(parseTable(tableLines));
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
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
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
        isTableStart(lines, index) ||
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
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
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

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { type ArticleMetadata, parseArticleMetadata } from "../src/components/features/ArticleSite/articleFrontmatter";
import { extractFrontmatterSource } from "../src/lib/mdx";
import { collectPublicRoutes, getIndexableCanonicalRoutes } from "./staticSite";

export const SITEMAP_SITE_URL = "https://shiftori.app";

const ARTICLE_CONTENT_DIR = join("src", "components", "features", "ArticleSite", "content", "articles");
const ARTICLE_ROUTE_PREFIX = "/articles/";
const ARTICLE_CATEGORY_ROUTE_PREFIX = "/articles/categories/";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type SitemapArticleMetadata = Pick<ArticleMetadata, "canonicalPath" | "publishedAt" | "slug" | "updatedAt">;

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isArticleDetailRoute(route: string): boolean {
  return route.startsWith(ARTICLE_ROUTE_PREFIX) && !route.startsWith(ARTICLE_CATEGORY_ROUTE_PREFIX);
}

function assertValidDate(value: string): void {
  if (!DATE_PATTERN.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`[sitemap] lastmod must be a calendar date in YYYY-MM-DD format: ${value}`);
  }
}

function validateSitemapUrl(value: string): URL {
  const url = new URL(value);
  if (url.origin !== SITEMAP_SITE_URL) {
    throw new Error(`[sitemap] URL must use ${SITEMAP_SITE_URL}: ${value}`);
  }
  if (url.search || url.hash) {
    throw new Error(`[sitemap] URL must not contain query or fragment: ${value}`);
  }
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    throw new Error(`[sitemap] URL must not have a trailing slash: ${value}`);
  }
  return url;
}

export function buildSitemapEntries(
  publicRoutes: readonly string[],
  articles: readonly SitemapArticleMetadata[],
): SitemapEntry[] {
  const canonicalRoutes = getIndexableCanonicalRoutes(publicRoutes);
  const canonicalRouteSet = new Set(canonicalRoutes);
  const articleByCanonicalPath = new Map<string, SitemapArticleMetadata>();

  for (const article of articles) {
    if (articleByCanonicalPath.has(article.canonicalPath)) {
      throw new Error(`[sitemap] duplicate article canonical path: ${article.canonicalPath}`);
    }
    if (!canonicalRouteSet.has(article.canonicalPath)) {
      throw new Error(`[sitemap] article canonical path is not an indexable public route: ${article.canonicalPath}`);
    }
    articleByCanonicalPath.set(article.canonicalPath, article);
  }

  return canonicalRoutes.map((route) => {
    const loc = new URL(route, SITEMAP_SITE_URL).href;
    validateSitemapUrl(loc);

    if (!isArticleDetailRoute(route)) {
      return { loc };
    }

    const article = articleByCanonicalPath.get(route);
    if (!article) {
      throw new Error(`[sitemap] article metadata is missing for canonical route: ${route}`);
    }
    const lastmod = article.updatedAt ?? article.publishedAt;
    assertValidDate(lastmod);
    return { loc, lastmod };
  });
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function serializeSitemap(entries: readonly SitemapEntry[]): string {
  const seen = new Set<string>();
  const normalized = entries
    .map((entry) => {
      const url = validateSitemapUrl(entry.loc);
      if (seen.has(url.href)) {
        throw new Error(`[sitemap] duplicate URL: ${url.href}`);
      }
      seen.add(url.href);
      if (entry.lastmod) assertValidDate(entry.lastmod);
      return { loc: url.href, lastmod: entry.lastmod };
    })
    .sort((left, right) => compareText(left.loc, right.loc));

  const urls = normalized.flatMap(({ loc, lastmod }) => [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
    "  </url>",
  ]);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export async function readPublishedArticleMetadata(repoRoot = process.cwd()): Promise<SitemapArticleMetadata[]> {
  const articlesDirectory = resolve(repoRoot, ARTICLE_CONTENT_DIR);
  const entries = await readdir(articlesDirectory, { withFileTypes: true });
  const articles = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith("_") &&
          existsSync(join(articlesDirectory, entry.name, "index.mdx")),
      )
      .map(async (entry) => {
        const source = await readFile(join(articlesDirectory, entry.name, "index.mdx"), "utf8");
        const frontmatterSource = extractFrontmatterSource(source);
        const frontmatter: unknown = frontmatterSource ? parse(frontmatterSource) : undefined;
        const metadata = parseArticleMetadata(frontmatter, entry.name);
        const expectedCanonicalPath = `${ARTICLE_ROUTE_PREFIX}${entry.name}`;
        if (metadata.canonicalPath !== expectedCanonicalPath) {
          throw new Error(
            `[sitemap] article "${entry.name}" canonicalPath must be ${expectedCanonicalPath}: ${metadata.canonicalPath}`,
          );
        }
        return metadata;
      }),
  );

  return articles.sort((left, right) => compareText(left.slug, right.slug));
}

export async function createExpectedSitemap(repoRoot = process.cwd()): Promise<string> {
  const [publicRoutes, articles] = await Promise.all([
    Promise.resolve(collectPublicRoutes(repoRoot)),
    readPublishedArticleMetadata(repoRoot),
  ]);
  return serializeSitemap(buildSitemapEntries(publicRoutes, articles));
}

export async function writeSitemap(repoRoot = process.cwd()): Promise<void> {
  const sitemap = await createExpectedSitemap(repoRoot);
  await writeFile(resolve(repoRoot, "public", "sitemap.xml"), sitemap, "utf8");
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await writeSitemap();
  console.log("[sitemap] Updated public/sitemap.xml from the public route manifest and article frontmatter");
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSitemapEntries,
  createExpectedSitemap,
  escapeXml,
  readPublishedArticleMetadata,
  type SitemapArticleMetadata,
  serializeSitemap,
} from "./sitemap";
import {
  CSR_SHELL_STATIC_ROUTES,
  collectPublicRoutes,
  getIndexableCanonicalRoutes,
  HELP_TASK_ROUTES,
  NOINDEX_PUBLIC_ROUTES,
} from "./staticSite";

const ARTICLE_CONTENT_DIR = join("src", "components", "features", "ArticleSite", "content", "articles");

/** 記事の日付更新で期待値を書き換えずに済むよう、YAMLの型変換を通さずfrontmatterに書かれたupdatedAtを読む */
async function readRawUpdatedAt(slug: string): Promise<string> {
  const source = await readFile(join(ARTICLE_CONTENT_DIR, slug, "index.mdx"), "utf8");
  const updatedAt = source.match(/^updatedAt: "(\d{4}-\d{2}-\d{2})"$/m)?.[1];
  if (!updatedAt) throw new Error(`${slug} has no quoted updatedAt`);
  return updatedAt;
}

const article = (slug: string, publishedAt: string, updatedAt?: string): SitemapArticleMetadata => ({
  slug,
  canonicalPath: `/articles/${slug}`,
  publishedAt,
  updatedAt,
});

describe("sitemap generator", () => {
  it("index可能なcanonicalだけを一件ずつ列挙し、記事だけにfrontmatter由来のlastmodを付ける", async () => {
    const publicRoutes = collectPublicRoutes();
    const articles = await readPublishedArticleMetadata();
    const entries = buildSitemapEntries(publicRoutes, articles);
    const paths = entries.map(({ loc }) => new URL(loc).pathname);

    expect(paths).toEqual(getIndexableCanonicalRoutes(publicRoutes));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).not.toContain("/articles/line-shift-collection-guide");
    expect(paths).not.toContain("/pricing");
    expect(paths).toContain("/help");
    for (const taskRoute of HELP_TASK_ROUTES) {
      expect(paths).toContain(taskRoute);
    }
    expect(paths.some((path) => path.startsWith("/help/"))).toBe(true);
    expect(paths).not.toContain("/faq");
    expect(paths).not.toContain("/howto");
    expect(paths).not.toContain("/commercial-transactions");
    expect(paths).not.toContain(CSR_SHELL_STATIC_ROUTES[0]);
    for (const route of NOINDEX_PUBLIC_ROUTES) {
      expect(paths).not.toContain(route);
    }

    const freeToolArticle = entries.find(({ loc }) => new URL(loc).pathname === "/articles/free-shift-tool-selection");
    expect(freeToolArticle).toEqual({
      loc: "https://shiftori.app/articles/free-shift-tool-selection",
      lastmod: await readRawUpdatedAt("free-shift-tool-selection"),
    });
    expect(entries.find(({ loc }) => new URL(loc).pathname === "/articles")?.lastmod).toBeUndefined();
    expect(
      entries.find(({ loc }) => new URL(loc).pathname === "/articles/categories/tool-review")?.lastmod,
    ).toBeUndefined();
  });

  it("一記事のupdatedAt変更はその記事のlastmodだけを変える", () => {
    const routes = ["/", "/articles/alpha", "/articles/beta"];
    const before = buildSitemapEntries(routes, [article("alpha", "2026-01-01"), article("beta", "2026-02-01")]);
    const after = buildSitemapEntries(routes, [
      article("alpha", "2026-01-01", "2026-03-01"),
      article("beta", "2026-02-01"),
    ]);
    const changed = after.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(before[index]));

    expect(changed).toEqual([{ loc: "https://shiftori.app/articles/alpha", lastmod: "2026-03-01" }]);
  });

  it("入力順、build日時、timezoneに依存せず、priorityとchangefreqを出力しない", () => {
    const routes = ["/features", "/articles/beta", "/", "/articles/alpha"];
    const articles = [article("beta", "2026-02-01"), article("alpha", "2026-01-01")];
    const first = serializeSitemap(buildSitemapEntries(routes, articles));
    const reordered = serializeSitemap(buildSitemapEntries([...routes].reverse(), [...articles].reverse()));

    expect(reordered).toBe(first);
    expect(first).not.toContain("<priority>");
    expect(first).not.toContain("<changefreq>");
    expect(first).not.toMatch(/2026-\d{2}-\d{2}.*features/);
  });

  it("XML予約文字をescapeし、URLとlastmodの不正値を拒否する", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");

    const xml = serializeSitemap([{ loc: "https://shiftori.app/articles/tea&coffee'" }]);
    const escapedLoc = xml.match(/<loc>([^<]+)<\/loc>/)?.[1];
    expect(escapedLoc).toBe("https://shiftori.app/articles/tea&amp;coffee&apos;");
    expect(escapedLoc?.replaceAll("&amp;", "&").replaceAll("&apos;", "'")).toBe(
      "https://shiftori.app/articles/tea&coffee'",
    );

    expect(() => serializeSitemap([{ loc: "https://example.com/" }])).toThrow("must use");
    expect(() => serializeSitemap([{ loc: "https://shiftori.app/features/" }])).toThrow("trailing slash");
    expect(() => serializeSitemap([{ loc: "https://shiftori.app/features?from=test" }])).toThrow("query");
    expect(() =>
      serializeSitemap([{ loc: "https://shiftori.app/features" }, { loc: "https://shiftori.app/features" }]),
    ).toThrow("duplicate URL");
    expect(() => serializeSitemap([{ loc: "https://shiftori.app/articles/example", lastmod: "2026-02-30" }])).toThrow(
      "calendar date",
    );
  });

  it("repositoryのfrontmatterから現在のsitemapを再現できる", async () => {
    const sitemap = await createExpectedSitemap();

    expect(sitemap).toContain("<loc>https://shiftori.app/</loc>");
    expect(sitemap).toContain(
      [
        "    <loc>https://shiftori.app/articles/excel-shift-management-limits</loc>",
        `    <lastmod>${await readRawUpdatedAt("excel-shift-management-limits")}</lastmod>`,
      ].join("\n"),
    );
  });
});

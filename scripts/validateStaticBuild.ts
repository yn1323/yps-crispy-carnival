import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertNoLoopbackUrls,
  assertOutputDirectory,
  CSR_SHELL_DYNAMIC_ROUTES,
  CSR_SHELL_STATIC_ROUTES,
  collectPublicRoutes,
  createCloudflareHeaders,
  createCloudflareRedirects,
  getCanonicalRoute,
  getIndexableCanonicalRoutes,
  NOINDEX_PUBLIC_ROUTES,
  routeToHtmlPath,
  STATIC_CLIENT_OUTPUT_DIR,
} from "./staticSite";

const SITE_URL = "https://shiftori.app";
const ARTICLE_ROUTE_PREFIX = "/articles/";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTag(html: string, tagName: string, attribute: string, value: string): string | undefined {
  const pattern = new RegExp(
    `<${tagName}\\b(?=[^>]*\\b${escapeRegExp(attribute)}=["']${escapeRegExp(value)}["'])[^>]*>`,
    "i",
  );
  return html.match(pattern)?.[0];
}

function getAttribute(tag: string | undefined, attribute: string): string | undefined {
  if (!tag) return undefined;
  return tag.match(new RegExp(`\\b${escapeRegExp(attribute)}=["']([^"']*)["']`, "i"))?.[1];
}

function countTags(html: string, tagName: string, attribute?: string, value?: string): number {
  if (attribute && value) {
    const pattern = new RegExp(
      `<${tagName}\\b(?=[^>]*\\b${escapeRegExp(attribute)}=["']${escapeRegExp(value)}["'])[^>]*>`,
      "gi",
    );
    return html.match(pattern)?.length ?? 0;
  }
  return html.match(new RegExp(`<${tagName}\\b`, "gi"))?.length ?? 0;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[static-build] ${message}`);
}

function assertPublicHtml(route: string, html: string): void {
  assert(html.length >= 2_000, `${route} produced suspiciously small HTML (${html.length} bytes)`);
  assert(/<h1[\s>]/i.test(html), `${route} has no h1`);
  assert(countTags(html, "title") === 1, `${route} must contain exactly one title`);

  const requiredMeta: Array<["name" | "property", string]> = [
    ["name", "description"],
    ["property", "og:title"],
    ["property", "og:description"],
    ["property", "og:type"],
    ["property", "og:image"],
    ["name", "twitter:title"],
    ["name", "twitter:description"],
    ["name", "twitter:image"],
  ];
  for (const [attribute, value] of requiredMeta) {
    assert(countTags(html, "meta", attribute, value) === 1, `${route} must contain one ${value} meta tag`);
  }

  const canonicalTag = findTag(html, "link", "rel", "canonical");
  const expectedCanonical = new URL(getCanonicalRoute(route), SITE_URL).href;
  assert(countTags(html, "link", "rel", "canonical") === 1, `${route} must contain exactly one canonical link`);
  assert(getAttribute(canonicalTag, "href") === expectedCanonical, `${route} canonical must be ${expectedCanonical}`);

  const robots = getAttribute(findTag(html, "meta", "name", "robots"), "content") ?? "";
  if (NOINDEX_PUBLIC_ROUTES.has(route)) {
    assert(/(?:^|[\s,])noindex(?:[\s,]|$)/i.test(robots), `${route} must be noindex`);
  } else {
    assert(!/(?:^|[\s,])noindex(?:[\s,]|$)/i.test(robots), `${route} must remain indexable`);
  }

  const emotionCssBytes = Array.from(html.matchAll(/<style\b[^>]*data-emotion=[^>]*>([\s\S]*?)<\/style>/gi), (match) =>
    Buffer.byteLength(match[1] ?? ""),
  ).reduce((total, bytes) => total + bytes, 0);
  assert(emotionCssBytes >= 5_000, `${route} has suspiciously little Emotion SSR CSS (${emotionCssBytes} bytes)`);
  assert(
    /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/[^"']+\.js["'])[^>]*>/i.test(html) &&
      html.includes('id="$tsr-stream-barrier"'),
    `${route} has no Start hydration payload`,
  );
  assertNoLoopbackUrls(route, html);
  assert(!/googletagmanager\.com|clarity\.ms/i.test(html), `${route} contains baked analytics`);
  assert(
    !/__PRERENDER__|data-prerender-path|data-spa-fallback/i.test(html),
    `${route} contains legacy prerender state`,
  );
}

function parseRedirectRules(contents: string): string[][] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));
}

function assertCloudflareFiles(publicRoutes: string[], redirects: string, headers: string): void {
  assert(redirects === createCloudflareRedirects(publicRoutes), "_redirects differs from the route manifest");
  assert(headers === createCloudflareHeaders(publicRoutes), "_headers differs from the route manifest");

  const rules = parseRedirectRules(redirects);
  assert(
    rules.every((rule) => rule.length === 3 && rule[2] === "200"),
    "all redirect rules must be 200 proxies",
  );
  assert(!rules.some(([source]) => source === "/*"), "catch-all SPA fallback is forbidden");
  assert(
    !rules.some(([source]) => source?.startsWith(ARTICLE_ROUTE_PREFIX) && source.includes(":")),
    "article slash aliases must enumerate known slugs instead of using placeholders",
  );

  for (const route of publicRoutes.filter((path) => path !== "/")) {
    const matches = rules.filter(([source, target]) => source === `${route}/` && target === route);
    assert(matches.length === 1, `${route}/ must have exactly one public 200 proxy`);
    assert(
      !rules.some(([source, target]) => source === route && target === "/_shell"),
      `${route} is shadowed by shell`,
    );
  }

  for (const route of [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES]) {
    for (const source of [route, `${route}/`]) {
      assert(
        rules.some(([candidate, target]) => candidate === source && target === "/_shell"),
        `${source} must proxy to the SPA shell`,
      );
    }
  }

  const staticRuleCount = rules.filter(([source]) => !source?.includes(":") && !source?.includes("*")).length;
  const dynamicRuleCount = rules.length - staticRuleCount;
  assert(staticRuleCount <= 2_000, `_redirects has ${staticRuleCount} static rules (limit: 2000)`);
  assert(dynamicRuleCount <= 100, `_redirects has ${dynamicRuleCount} dynamic rules (limit: 100)`);

  const headerRuleCount = headers
    .split(/\r?\n/)
    .filter((line) => line !== "" && !line.startsWith("#") && !/^\s/.test(line)).length;
  assert(headerRuleCount <= 100, `_headers has ${headerRuleCount} rules (limit: 100)`);
  assert(
    (headers.match(/Clear-Site-Data:/g) ?? []).length === 2,
    "Clear-Site-Data must appear for both cache-reset URL variants",
  );
  for (const route of ["/cache-reset", "/cache-reset/"]) {
    assert(
      headers.includes(
        `${route}\n  Clear-Site-Data: "cache"\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer`,
      ),
      `${route} must clear only cache without clearing authentication state`,
    );
  }
  assert(!/Clear-Site-Data:.*(?:cookies|storage|\*)/i.test(headers), "cache reset must preserve cookies and storage");
}

async function assertSitemap(publicRoutes: string[], repoRoot: string, outputDirectory: string): Promise<void> {
  const [sourceSitemap, deployedSitemap] = await Promise.all([
    readFile(join(repoRoot, "public", "sitemap.xml"), "utf8"),
    readFile(join(outputDirectory, "sitemap.xml"), "utf8"),
  ]);
  assert(deployedSitemap === sourceSitemap, "deployed sitemap differs from public/sitemap.xml");
  const sitemap = deployedSitemap;
  const locValues = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]).filter(
    (value): value is string => value !== undefined,
  );
  const paths = locValues.map((value) => {
    const url = new URL(value);
    assert(url.origin === SITE_URL, `sitemap URL must use ${SITE_URL}: ${value}`);
    assert(url.search === "" && url.hash === "", `sitemap URL must not contain query or fragment: ${value}`);
    assert(url.pathname === "/" || !url.pathname.endsWith("/"), `sitemap URL must be no-slash: ${value}`);
    return url.pathname;
  });
  const expected = getIndexableCanonicalRoutes(publicRoutes);
  assert(
    JSON.stringify(paths.sort((left, right) => left.localeCompare(right))) === JSON.stringify(expected),
    "sitemap URLs differ from the indexable SSG canonical routes",
  );
}

export async function validateStaticBuild(
  outputDirectory = STATIC_CLIENT_OUTPUT_DIR,
  repoRoot = process.cwd(),
): Promise<void> {
  const resolvedOutput = assertOutputDirectory(outputDirectory, repoRoot);
  const publicRoutes = collectPublicRoutes(repoRoot);

  for (const route of publicRoutes) {
    const htmlPath = join(resolvedOutput, routeToHtmlPath(route));
    assert(existsSync(htmlPath), `${route} is missing ${routeToHtmlPath(route)}`);
    if (route !== "/") {
      assert(!existsSync(join(resolvedOutput, route.slice(1), "index.html")), `${route} was emitted as a slash URL`);
    }
    assertPublicHtml(route, await readFile(htmlPath, "utf8"));
  }

  for (const route of CSR_SHELL_STATIC_ROUTES) {
    assert(!existsSync(join(resolvedOutput, routeToHtmlPath(route))), `${route} must not be prerendered`);
  }

  for (const route of publicRoutes.filter(
    (path) => path.startsWith(ARTICLE_ROUTE_PREFIX) && !path.startsWith("/articles/categories/"),
  )) {
    const slug = getCanonicalRoute(route).slice(ARTICLE_ROUTE_PREFIX.length);
    assert(existsSync(join(resolvedOutput, "ogp", "articles", `${slug}.png`)), `${route} is missing its OGP image`);
  }

  const shellPath = join(resolvedOutput, "_shell.html");
  const notFoundPath = join(resolvedOutput, "404.html");
  assert(existsSync(shellPath), "_shell.html is missing");
  assert(existsSync(notFoundPath), "404.html is missing");

  const shellHtml = await readFile(shellPath, "utf8");
  assert(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(shellHtml), "shell is not noindex");
  assert(
    /<meta\b[^>]*name=["']referrer["'][^>]*content=["']no-referrer["']/i.test(shellHtml),
    "shell has no no-referrer policy",
  );
  assert(!findTag(shellHtml, "link", "rel", "canonical"), "shell must not contain a public canonical URL");
  assert(!/シフトのやり取りを/.test(shellHtml), "shell contains baked TOP content");

  const notFoundHtml = await readFile(notFoundPath, "utf8");
  assert(/ページが見つかりません/.test(notFoundHtml), "404.html has no not-found content");
  assert(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(notFoundHtml), "404 is not noindex");
  assert(/\bdata-static-not-found(?:=["'][^"']*["'])?/.test(notFoundHtml), "404 is not marked as static");

  const [redirects, headers] = await Promise.all([
    readFile(join(resolvedOutput, "_redirects"), "utf8"),
    readFile(join(resolvedOutput, "_headers"), "utf8"),
  ]);
  assertCloudflareFiles(publicRoutes, redirects, headers);
  await assertSitemap(publicRoutes, repoRoot, resolvedOutput);

  console.log(
    `[static-build] Validated ${publicRoutes.length} SSG pages, sitemap, SPA shell, 404, and Cloudflare rules`,
  );
}

await validateStaticBuild();

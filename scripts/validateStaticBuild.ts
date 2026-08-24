import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createExpectedSitemap } from "./sitemap";
import {
  assertNoLoopbackUrls,
  assertOutputDirectory,
  CSR_SHELL_DYNAMIC_ROUTES,
  CSR_SHELL_STATIC_ROUTES,
  collectPublicRoutes,
  createCloudflareHeaders,
  createCloudflareRedirects,
  getCanonicalRoute,
  NOINDEX_PUBLIC_ROUTES,
  routeToHtmlPath,
  STATIC_CLIENT_OUTPUT_DIR,
} from "./staticSite";

const SITE_URL = "https://shiftori.app";
const ARTICLE_ROUTE_PREFIX = "/articles/";
const COMMERCIAL_TRANSACTIONS_ROUTE = "/commercial-transactions";
const PUBLIC_PLAN_PRICE_ROUTES = new Set(["/", COMMERCIAL_TRANSACTIONS_ROUTE]);
const MAX_STATIC_OUTPUT_ENTRIES = 10_000;
const BAKED_MEASUREMENT_SCRIPT_PATTERN =
  /\b(?:[a-z0-9-]+\.)*(?:googletagmanager\.com|google-analytics\.com|clarity\.ms)\b/i;
const PUBLIC_PRICE_SECRET_PATTERN = /STRIPE_(?:SECRET_KEY|PRICE_READ_KEY)|\b(?:rk|sk)_(?:live|test)_/i;
const STRIPE_PRICE_ID_PATTERN = /\bprice_(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}\b/;
const HELP_INDEX_BUNDLE_PATTERN = /\/assets\/(?:help\.index|helpIndexData)-[^"'\s]+\.js/;
const PUBLIC_PRICE_PLACEHOLDERS = [
  "【手動入力：Standardの月額料金と税込・税別】",
  "【手動入力：Proの月額料金と税込・税別】",
  "【手動入力：Businessの月額料金と税込・税別】",
] as const;

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

export function assertNoBakedMeasurementScripts(label: string, html: string): void {
  const transportTags =
    html.match(/<(?:script|iframe|img|link)\b[^>]*(?:>[\s\S]*?<\/(?:script|iframe)\s*>|\/?>)/gi) ?? [];
  assert(
    transportTags.every((transportTag) => !BAKED_MEASUREMENT_SCRIPT_PATTERN.test(transportTag)),
    `${label} contains baked GTM, Google Analytics, or Clarity markup`,
  );
}

export function assertNoStripeBuildValues(label: string, contents: string): void {
  assert(!PUBLIC_PRICE_SECRET_PATTERN.test(contents), `${label} contains a Stripe secret or secret environment name`);
  assert(!STRIPE_PRICE_ID_PATTERN.test(contents), `${label} contains a Stripe Price ID`);
}

export function assertHelpIndexBundleBoundary(route: string, html: string): void {
  assert(
    route === "/help" || !HELP_INDEX_BUNDLE_PATTERN.test(html),
    `${route} must not preload the /help full-text search bundle`,
  );
}

async function collectStaticCodeArtifacts(outputDirectory: string): Promise<string[]> {
  const directories = [outputDirectory];
  const artifacts: string[] = [];
  let traversedEntries = 0;

  while (directories.length > 0) {
    const directory = directories.pop();
    assert(directory, "static artifact traversal lost its directory");

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      traversedEntries += 1;
      assert(
        traversedEntries <= MAX_STATIC_OUTPUT_ENTRIES,
        `static output has more than ${MAX_STATIC_OUTPUT_ENTRIES} entries`,
      );
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(path);
      } else if (entry.isFile() && (entry.name.endsWith(".html") || entry.name.endsWith(".js"))) {
        artifacts.push(path);
      }
    }
  }

  return artifacts.sort();
}

async function assertNoStripeValuesInStaticArtifacts(outputDirectory: string): Promise<void> {
  for (const artifactPath of await collectStaticCodeArtifacts(outputDirectory)) {
    const label = artifactPath.slice(outputDirectory.length + 1);
    assertNoStripeBuildValues(label, await readFile(artifactPath, "utf8"));
  }
}

type PublicPriceMarkup = {
  openingTag: string;
  innerHtml: string;
};

type PublicPriceInterval = "day" | "week" | "month" | "year";

function collectPublicPriceMarkup(html: string): PublicPriceMarkup[] {
  const matches: PublicPriceMarkup[] = [];
  const openingTagPattern = /<([a-z][\w:-]*)\b(?=[^>]*\bdata-public-plan-price=["'][^"']+["'])[^>]*>/gi;

  for (const openingMatch of html.matchAll(openingTagPattern)) {
    const openingTag = openingMatch[0];
    const tagName = openingMatch[1];
    const openingIndex = openingMatch.index;
    assert(tagName && openingIndex !== undefined, "public plan price markup could not be parsed");

    const sameTagPattern = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
    sameTagPattern.lastIndex = openingIndex + openingTag.length;
    let depth = 1;
    let closingIndex: number | undefined;

    for (const tagMatch of html.matchAll(sameTagPattern)) {
      const tag = tagMatch[0];
      if (tag.startsWith("</")) {
        depth -= 1;
      } else if (!tag.endsWith("/>")) {
        depth += 1;
      }
      if (depth === 0) {
        closingIndex = tagMatch.index;
        break;
      }
    }

    assert(closingIndex !== undefined, "public plan price element must have a closing tag");
    matches.push({
      openingTag,
      innerHtml: html.slice(openingIndex + openingTag.length, closingIndex),
    });
  }

  return matches;
}

function decodeVisibleText(innerHtml: string): string {
  return innerHtml
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&yen;/gi, "¥")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPublicPriceAmount(currencyValue: string, unitAmount: number): string {
  const currency = currencyValue.toUpperCase();
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    currencyDisplay: currency === "JPY" ? "symbol" : "code",
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const formatted = formatter.format(unitAmount / 10 ** fractionDigits);
  return (currency === "JPY" ? formatted.replace("￥", "¥") : formatted).replace(/\s+/g, " ");
}

function isPublicPriceInterval(value: string | undefined): value is PublicPriceInterval {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function formatPublicBillingUnit(interval: PublicPriceInterval, intervalCount: number): string {
  const unit = { day: "日", week: "週間", month: "か月", year: "年" }[interval];
  return `${intervalCount}${unit}`;
}

export function assertPublicPlanPriceMarkup(label: string, html: string): void {
  for (const placeholder of PUBLIC_PRICE_PLACEHOLDERS) {
    assert(!html.includes(placeholder), `${label} contains a manual public plan price placeholder`);
  }
  assertNoStripeBuildValues(label, html);

  const priceMarkup = collectPublicPriceMarkup(html);
  assert(priceMarkup.length === 2, `${label} must contain exactly two public plan price elements`);

  const plans = priceMarkup.map(({ openingTag }) => getAttribute(openingTag, "data-public-plan-price") ?? "").sort();
  assert(
    plans.length === 2 && plans[0] === "business" && plans[1] === "pro",
    `${label} must contain exactly one Standard and one Pro public plan price`,
  );

  const parsedPrices = priceMarkup.map(({ openingTag, innerHtml }) => {
    const plan = getAttribute(openingTag, "data-public-plan-price");
    const currency = getAttribute(openingTag, "data-currency");
    const unitAmountValue = getAttribute(openingTag, "data-unit-amount");
    const interval = getAttribute(openingTag, "data-interval");
    const intervalCountValue = getAttribute(openingTag, "data-interval-count");
    const taxBehavior = getAttribute(openingTag, "data-tax-behavior");

    assert(currency && /^[a-z]{3}$/i.test(currency), `${label} ${plan} price must have a three-letter currency`);
    assert(unitAmountValue && /^\d+$/.test(unitAmountValue), `${label} ${plan} price must have an integer unit amount`);
    const unitAmount = Number(unitAmountValue);
    assert(
      Number.isSafeInteger(unitAmount) && unitAmount > 0,
      `${label} ${plan} price must have a positive unit amount`,
    );
    assert(isPublicPriceInterval(interval), `${label} ${plan} price must have a supported interval`);
    assert(
      intervalCountValue && /^\d+$/.test(intervalCountValue),
      `${label} ${plan} price must have an integer interval count`,
    );
    const intervalCount = Number(intervalCountValue);
    assert(
      Number.isSafeInteger(intervalCount) && intervalCount > 0,
      `${label} ${plan} price must have a positive interval count`,
    );
    assert(
      taxBehavior === "inclusive" || taxBehavior === "exclusive",
      `${label} ${plan} price must have an explicit tax behavior`,
    );

    return {
      plan,
      currency: currency.toLowerCase(),
      unitAmount,
      interval,
      intervalCount,
      taxBehavior,
      visibleText: decodeVisibleText(innerHtml),
    };
  });

  assert(parsedPrices[0]?.currency === parsedPrices[1]?.currency, `${label} public plan prices must use one currency`);
  assert(
    parsedPrices[0]?.interval === parsedPrices[1]?.interval &&
      parsedPrices[0]?.intervalCount === parsedPrices[1]?.intervalCount,
    `${label} public plan prices must use one billing interval`,
  );

  for (const price of parsedPrices) {
    const amount = formatPublicPriceAmount(price.currency, price.unitAmount);
    const taxLabel = price.taxBehavior === "inclusive" ? "税込" : "税別";
    const expectedText = `${amount}/${formatPublicBillingUnit(price.interval, price.intervalCount)}（${taxLabel}）`;
    assert(price.visibleText === expectedText, `${label} ${price.plan} visible price must equal ${expectedText}`);
  }
}

function assertPublicHtml(route: string, html: string): void {
  assert(html.length >= 2_000, `${route} produced suspiciously small HTML (${html.length} bytes)`);
  assert(countTags(html, "h1") === 1, `${route} must contain exactly one h1`);
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
  assertNoBakedMeasurementScripts(route, html);
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

async function assertSitemap(repoRoot: string, outputDirectory: string): Promise<void> {
  const [expectedSitemap, sourceSitemap, deployedSitemap] = await Promise.all([
    createExpectedSitemap(repoRoot),
    readFile(join(repoRoot, "public", "sitemap.xml"), "utf8"),
    readFile(join(outputDirectory, "sitemap.xml"), "utf8"),
  ]);
  assert(
    sourceSitemap === expectedSitemap,
    "public/sitemap.xml is stale; run `pnpm sitemap:generate` and include the generated artifact",
  );
  assert(deployedSitemap === expectedSitemap, "deployed sitemap differs from the metadata-derived sitemap");
}

export async function validateStaticBuild(
  outputDirectory = STATIC_CLIENT_OUTPUT_DIR,
  repoRoot = process.cwd(),
): Promise<void> {
  const resolvedOutput = assertOutputDirectory(outputDirectory, repoRoot);
  const publicRoutes = collectPublicRoutes(repoRoot);

  await assertNoStripeValuesInStaticArtifacts(resolvedOutput);

  for (const route of publicRoutes) {
    const htmlPath = join(resolvedOutput, routeToHtmlPath(route));
    assert(existsSync(htmlPath), `${route} is missing ${routeToHtmlPath(route)}`);
    if (route !== "/") {
      assert(!existsSync(join(resolvedOutput, route.slice(1), "index.html")), `${route} was emitted as a slash URL`);
    }
    const html = await readFile(htmlPath, "utf8");
    assertPublicHtml(route, html);
    assertHelpIndexBundleBoundary(route, html);
    if (PUBLIC_PLAN_PRICE_ROUTES.has(route)) {
      assertPublicPlanPriceMarkup(route, html);
    }
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
  assertNoBakedMeasurementScripts("_shell.html", shellHtml);

  const notFoundHtml = await readFile(notFoundPath, "utf8");
  assert(/ページが見つかりません/.test(notFoundHtml), "404.html has no not-found content");
  assert(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(notFoundHtml), "404 is not noindex");
  assert(/\bdata-static-not-found(?:=["'][^"']*["'])?/.test(notFoundHtml), "404 is not marked as static");
  assertNoBakedMeasurementScripts("404.html", notFoundHtml);

  const [redirects, headers] = await Promise.all([
    readFile(join(resolvedOutput, "_redirects"), "utf8"),
    readFile(join(resolvedOutput, "_headers"), "utf8"),
  ]);
  assertCloudflareFiles(publicRoutes, redirects, headers);
  await assertSitemap(repoRoot, resolvedOutput);

  console.log(
    `[static-build] Validated ${publicRoutes.length} SSG pages, sitemap, SPA shell, 404, and Cloudflare rules`,
  );
}

const invokedScript = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScript === fileURLToPath(import.meta.url)) {
  await validateStaticBuild();
}

import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { articleSlugAliases, resolveArticleSlug } from "../src/components/features/ArticleSite/articleAliases";
import { SHIFT_MANAGEMENT_SCENARIO } from "../src/components/features/HelpCenter/helpScenario";
import { HELP_TASK_IDS } from "../src/components/features/HelpCenter/helpTasks";
import { ORGANIZATION_STRUCTURE_HELP } from "../src/components/features/HelpCenter/organizationStructureHelp";

export const STATIC_CLIENT_OUTPUT_DIR = "dist/client";
export const STATIC_404_BUILD_PATH = "/__static-404";

export const FIXED_PUBLIC_ROUTES = [
  "/",
  "/account-deletion-accepted",
  "/articles",
  "/cache-reset",
  "/commercial-transactions",
  "/contact",
  "/demo/flow",
  "/demo/shiftboard",
  "/features",
  "/help",
  ORGANIZATION_STRUCTURE_HELP.href,
  SHIFT_MANAGEMENT_SCENARIO.href,
  "/privacy",
  "/privacy/manager",
  "/privacy/staff",
  "/terms",
  "/terms/manager",
  "/terms/staff",
] as const;

export const NOINDEX_PUBLIC_ROUTES = new Set<string>([
  "/account-deletion-accepted",
  "/cache-reset",
  "/commercial-transactions",
  "/privacy",
  "/privacy/manager",
  "/privacy/staff",
  "/terms",
  "/terms/manager",
  "/terms/staff",
]);

export const HELP_TASK_ROUTES = HELP_TASK_IDS.map((taskId) => `/help/tasks/${taskId}`);

/** Queryを含めず、指定されたpathだけをCSR shellへ渡す。 */
export const CSR_SHELL_STATIC_ROUTES = [
  "/account",
  "/actions",
  "/app",
  "/app/actions",
  "/app/manage",
  "/app/manage/billing",
  "/app/manage/managers",
  "/app/manage/managers/invite-new",
  "/app/manage/managers/invite-staff",
  "/app/manage/organization",
  "/app/shifts",
  "/app/staff",
  "/dashboard",
  "/forgot-password",
  "/legal/staff/consent",
  "/line/callback",
  "/login",
  "/manage",
  "/manage/billing",
  "/manage/managers",
  "/manage/managers/invite-new",
  "/manage/managers/invite-staff",
  "/manage/organization",
  "/manager-invite",
  "/shifts",
  "/shifts/reissue",
  "/shifts/submit",
  "/shifts/submit/completed",
  "/shifts/view",
  "/signup",
  "/sso-callback",
  "/staff",
  "/staff/register",
] as const;

/** Cloudflare Pagesのnamed placeholder。長いpathを先に評価する。 */
export const CSR_SHELL_DYNAMIC_ROUTES = [
  "/staff/:personId/shops/:shopId",
  "/manage/shops/:shopId",
  "/shifts/:recruitmentId/board",
  "/staff/:personId",
  "/app/staff/:personId/shops/:shopId",
  "/app/manage/shops/:shopId",
  "/app/shifts/:recruitmentId/board",
  "/app/staff/:personId",
] as const;

const CSR_SHELL_HEADER_PREFIX_ROUTES = ["/app", "/manage", "/shifts", "/staff"] as const;

const ARTICLE_CONTENT_DIR = join("src", "components", "features", "ArticleSite", "content");
const HELP_GUIDE_CONTENT_DIR = join("src", "components", "features", "HelpCenter", "content", "guides");
const LOOPBACK_URL_PATTERN = /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/[^\s"'<>]*)?/i;

export function assertNoLoopbackUrls(route: string, html: string): void {
  const match = html.match(LOOPBACK_URL_PATTERN);
  if (!match) return;

  throw new Error(`[static-build] ${route} contains a loopback URL (${match[0]})`);
}

function listPublishedContentSlugs(repoRoot: string, kind: "articles" | "categories"): string[] {
  const directory = resolve(repoRoot, ARTICLE_CONTENT_DIR, kind);
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith("_") && existsSync(join(directory, entry.name, "index.mdx")),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function listPublishedHelpGuideSlugs(repoRoot: string): string[] {
  const directory = resolve(repoRoot, HELP_GUIDE_CONTENT_DIR);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx") && !entry.name.startsWith("_"))
    .map((entry) => entry.name.slice(0, -".mdx".length))
    .sort((left, right) => left.localeCompare(right));
}

/** SSG対象は公開routeのallowlistだけから構築し、認証・Capability routeを自動探索しない。 */
export function collectPublicRoutes(repoRoot = process.cwd()): string[] {
  const articleSlugs = listPublishedContentSlugs(repoRoot, "articles");
  for (const [alias, target] of Object.entries(articleSlugAliases)) {
    if (!articleSlugs.includes(target)) {
      throw new Error(`Article alias "${alias}" points to unpublished slug "${target}"`);
    }
    if (articleSlugs.includes(alias)) {
      throw new Error(`Article alias "${alias}" conflicts with a published content directory`);
    }
  }

  const articleRoutes = [...articleSlugs, ...Object.keys(articleSlugAliases)].map((slug) => `/articles/${slug}`);
  const categoryRoutes = listPublishedContentSlugs(repoRoot, "categories").map(
    (slug) => `/articles/categories/${slug}`,
  );
  const helpGuideRoutes = listPublishedHelpGuideSlugs(repoRoot).map((slug) => `/help/${slug}`);

  return Array.from(
    new Set([...FIXED_PUBLIC_ROUTES, ...HELP_TASK_ROUTES, ...articleRoutes, ...categoryRoutes, ...helpGuideRoutes]),
  ).sort((left, right) => left.localeCompare(right));
}

/** 互換URLを含め、検索エンジンへ示すno-slash canonical pathを返す。 */
export function getCanonicalRoute(route: string): string {
  const match = route.match(/^\/articles\/([^/]+)$/);
  if (!match?.[1]) return route;
  return `/articles/${resolveArticleSlug(match[1])}`;
}

export function getIndexableCanonicalRoutes(publicRoutes: readonly string[]): string[] {
  return Array.from(
    new Set(publicRoutes.filter((route) => !NOINDEX_PUBLIC_ROUTES.has(route)).map(getCanonicalRoute)),
  ).sort((left, right) => left.localeCompare(right));
}

export function routeToHtmlPath(route: string): string {
  if (route === "/") return "index.html";
  return `${route.slice(1)}.html`;
}

function withOptionalTrailingSlash(route: string): string[] {
  return [route, `${route}/`];
}

export function createCloudflareRedirects(publicRoutes: readonly string[]): string {
  const publicAliases = publicRoutes
    .filter((route) => route !== "/")
    .sort((left, right) => right.split("/").length - left.split("/").length || left.localeCompare(right))
    .map((route) => `${route}/ ${route} 200`);

  const staticShellRules = CSR_SHELL_STATIC_ROUTES.flatMap(withOptionalTrailingSlash).map(
    (route) => `${route} /_shell 200`,
  );
  const dynamicShellRules = CSR_SHELL_DYNAMIC_ROUTES.flatMap(withOptionalTrailingSlash).map(
    (route) => `${route} /_shell 200`,
  );

  return [
    "# Generated by scripts/prepareStaticDeployment.ts. Do not edit the build artifact.",
    "# Existing public URLs with a trailing slash terminate legacy cached 308 redirects with a 200 proxy.",
    ...publicAliases,
    "",
    "# Authentication and capability URLs are rendered only in the browser from the neutral SPA shell.",
    ...staticShellRules,
    ...dynamicShellRules,
    "",
  ].join("\n");
}

const SHELL_HEADERS = [
  "  Cache-Control: no-store",
  "  X-Robots-Tag: noindex, nofollow",
  "  Referrer-Policy: no-referrer",
] as const;

const CACHE_RESET_HEADERS = [
  '  Clear-Site-Data: "cache"',
  "  Cache-Control: no-store",
  "  X-Robots-Tag: noindex, nofollow",
  "  Referrer-Policy: no-referrer",
] as const;

export function createCloudflareHeaders(publicRoutes: readonly string[]): string {
  const blocks: string[][] = [
    ["/cache-reset", ...CACHE_RESET_HEADERS],
    ["/cache-reset/", ...CACHE_RESET_HEADERS, '  Link: <https://shiftori.app/cache-reset>; rel="canonical"'],
    ["/_shell.html", ...SHELL_HEADERS],
    ["/_shell", ...SHELL_HEADERS],
    ["/404.html", "  Cache-Control: no-store", "  X-Robots-Tag: noindex, nofollow"],
    ["/404", "  Cache-Control: no-store", "  X-Robots-Tag: noindex, nofollow"],
  ];

  for (const route of publicRoutes.filter((path) => path !== "/" && path !== "/cache-reset")) {
    blocks.push([`${route}/`, `  Link: <https://shiftori.app${getCanonicalRoute(route)}>; rel="canonical"`]);
  }

  const explicitShellHeaderRoutes = [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES]
    .filter(
      (route) => !CSR_SHELL_HEADER_PREFIX_ROUTES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`)),
    )
    .flatMap(withOptionalTrailingSlash);
  const prefixShellHeaderRoutes = CSR_SHELL_HEADER_PREFIX_ROUTES.flatMap((prefix) => [prefix, `${prefix}/*`]);
  // 同じprefix配下のshellは2ルールへ集約し、Cloudflare Pagesの100 header rules制限を守る。
  for (const route of [...prefixShellHeaderRoutes, ...explicitShellHeaderRoutes]) {
    blocks.push([route, ...SHELL_HEADERS]);
  }

  return [
    "# Generated by scripts/prepareStaticDeployment.ts. Do not edit the build artifact.",
    ...blocks.flatMap((block, index) => (index === blocks.length - 1 ? block : [...block, ""])),
    "",
  ].join("\n");
}

export function assertOutputDirectory(outputDirectory: string, repoRoot = process.cwd()): string {
  const resolvedRoot = resolve(repoRoot);
  const resolvedOutput = resolve(repoRoot, outputDirectory);
  const relativeOutput = relative(resolvedRoot, resolvedOutput);
  if (relativeOutput.startsWith("..") || relativeOutput === "") {
    throw new Error(`Static output must be a directory inside the repository: ${resolvedOutput}`);
  }
  return resolvedOutput;
}

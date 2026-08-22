import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNoLoopbackUrls,
  assertOutputDirectory,
  CSR_SHELL_DYNAMIC_ROUTES,
  CSR_SHELL_STATIC_ROUTES,
  collectPublicRoutes,
  createCloudflareHeaders,
  createCloudflareRedirects,
  FIXED_PUBLIC_ROUTES,
  getCanonicalRoute,
  getIndexableCanonicalRoutes,
  NOINDEX_PUBLIC_ROUTES,
  routeToHtmlPath,
} from "./staticSite";

describe("static site manifest", () => {
  it("generated route treeの全URLを公開SSG・CSR shell・404へ分類する", () => {
    const routeTree = readFileSync(join(process.cwd(), "src/routeTree.gen.ts"), "utf8");
    const fullPathInterface = routeTree.match(/export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/)?.[1];
    expect(fullPathInterface).toBeDefined();

    const actual = new Set(
      Array.from(fullPathInterface?.matchAll(/^\s+'([^']+)':/gm) ?? [], (match) => match[1] as string).map((route) =>
        route !== "/" && route.endsWith("/") ? route.slice(0, -1) : route,
      ),
    );
    const csrPatterns = [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES].map((route) =>
      route.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, param: string) => `$${param}`),
    );
    const expected = new Set([
      ...FIXED_PUBLIC_ROUTES,
      "/articles/$slug",
      "/articles/categories/$categorySlug",
      "/app/staff/order",
      "/staff/order",
      ...csrPatterns,
      "/$",
    ]);

    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it("公開済みの記事とカテゴリだけをSSG対象へ追加する", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "shiftori-static-site-"));
    const contentRoot = join(repoRoot, "src/components/features/ArticleSite/content");

    try {
      for (const path of [
        "articles/published",
        "articles/shiftori-line-workflow",
        "articles/missing-entry",
        "articles/_draft",
        "categories/operations",
      ]) {
        mkdirSync(join(contentRoot, path), { recursive: true });
      }
      writeFileSync(join(contentRoot, "articles/published/index.mdx"), "# Published");
      writeFileSync(join(contentRoot, "articles/shiftori-line-workflow/index.mdx"), "# Current article");
      writeFileSync(join(contentRoot, "articles/_draft/index.mdx"), "# Draft");
      writeFileSync(join(contentRoot, "categories/operations/index.mdx"), "# Operations");

      const routes = collectPublicRoutes(repoRoot);

      expect(routes).toContain("/articles/published");
      expect(routes).toContain("/articles/line-shift-collection-guide");
      expect(routes).toContain("/articles/categories/operations");
      expect(routes).not.toContain("/articles/missing-entry");
      expect(routes).not.toContain("/articles/_draft");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("記事aliasの対象不在と公開slugとの衝突を拒否する", () => {
    const missingTargetRoot = mkdtempSync(join(tmpdir(), "shiftori-static-site-"));
    const conflictRoot = mkdtempSync(join(tmpdir(), "shiftori-static-site-"));

    try {
      for (const repoRoot of [missingTargetRoot, conflictRoot]) {
        mkdirSync(join(repoRoot, "src/components/features/ArticleSite/content/articles"), { recursive: true });
        mkdirSync(join(repoRoot, "src/components/features/ArticleSite/content/categories"), { recursive: true });
      }
      for (const slug of ["shiftori-line-workflow", "line-shift-collection-guide"]) {
        const directory = join(conflictRoot, "src/components/features/ArticleSite/content/articles", slug);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "index.mdx"), "# Article");
      }

      expect(() => collectPublicRoutes(missingTargetRoot)).toThrow("points to unpublished slug");
      expect(() => collectPublicRoutes(conflictRoot)).toThrow("conflicts with a published content directory");
    } finally {
      rmSync(missingTargetRoot, { recursive: true, force: true });
      rmSync(conflictRoot, { recursive: true, force: true });
    }
  });

  it("公開済みの旧記事slugを現記事のcanonicalへ解決する", () => {
    expect(getCanonicalRoute("/articles/line-shift-collection-guide")).toBe("/articles/shiftori-line-workflow");
    expect(getCanonicalRoute("/articles/shiftori-line-workflow")).toBe("/articles/shiftori-line-workflow");
    expect(getCanonicalRoute("/articles/categories/shift-request")).toBe("/articles/categories/shift-request");
  });

  it("sitemap対象をindex可能なcanonical URLへ重複なく畳み込む", () => {
    expect(FIXED_PUBLIC_ROUTES).toContain("/commercial-transactions");
    expect(NOINDEX_PUBLIC_ROUTES.has("/commercial-transactions")).toBe(true);
    expect(
      getIndexableCanonicalRoutes([
        "/",
        "/cache-reset",
        "/commercial-transactions",
        "/articles/line-shift-collection-guide",
        "/articles/shiftori-line-workflow",
      ]),
    ).toEqual(["/", "/articles/shiftori-line-workflow"]);
  });

  it("robots.txtのDisallowは実在するCSR routeのprefixだけを持つ", () => {
    const robots = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");
    const disallowRules = Array.from(robots.matchAll(/^Disallow:\s*(\S+)$/gm), (match) => match[1]).filter(
      (rule): rule is string => rule !== undefined,
    );
    const csrRoutes = [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES];

    expect(disallowRules).not.toContain("/welcome");
    expect(disallowRules).toEqual([
      "/app",
      "/account",
      "/actions",
      "/dashboard",
      "/manage",
      "/shifts",
      "/staff",
      "/line/callback",
      "/legal/staff/consent",
      "/sso-callback",
    ]);
    for (const rule of disallowRules) {
      expect(csrRoutes.some((route) => route === rule || route.startsWith(`${rule}/`))).toBe(true);
    }
  });

  it.each([
    ["/", "index.html"],
    ["/features", "features.html"],
    ["/articles/example", "articles/example.html"],
  ])("%sを末尾slashなしのHTML pathへ変換する", (route, expected) => {
    expect(routeToHtmlPath(route)).toBe(expected);
  });

  it("実在する公開slash aliasとCSR routeだけを200 proxyする", () => {
    const redirects = createCloudflareRedirects(["/", "/features", "/articles/known"]);

    expect(redirects).toContain("/features/ /features 200");
    expect(redirects).toContain("/articles/known/ /articles/known 200");
    expect(redirects).not.toContain("/articles/:slug");
    expect(redirects).not.toContain("/*");

    for (const route of [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES]) {
      expect(redirects).toContain(`${route} /_shell 200`);
      expect(redirects).toContain(`${route}/ /_shell 200`);
    }
  });

  it("cache resetだけをcache消去対象にし、shellへno-storeとnoindexを付ける", () => {
    const headers = createCloudflareHeaders(["/", "/features"]);

    expect(headers.match(/Clear-Site-Data:/g)).toHaveLength(2);
    for (const route of ["/cache-reset", "/cache-reset/"]) {
      expect(headers).toContain(
        `${route}\n  Clear-Site-Data: "cache"\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer`,
      );
    }
    expect(headers).not.toMatch(/Clear-Site-Data:.*(?:cookies|storage|\*)/i);
    expect(headers).toContain('/features/\n  Link: <https://shiftori.app/features>; rel="canonical"');
    expect(createCloudflareHeaders(["/articles/line-shift-collection-guide"])).toContain(
      '/articles/line-shift-collection-guide/\n  Link: <https://shiftori.app/articles/shiftori-line-workflow>; rel="canonical"',
    );

    for (const route of ["/app", "/app/*", "/manage", "/manage/*", "/shifts", "/shifts/*", "/staff", "/staff/*"]) {
      expect(headers).toContain(
        `${route}\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer`,
      );
    }

    for (const route of [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES].filter(
      (path) =>
        !["/app", "/manage", "/shifts", "/staff"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
    )) {
      for (const source of [route, `${route}/`]) {
        expect(headers).toContain(
          `${source}\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer`,
        );
      }
    }

    const headerRuleCount = createCloudflareHeaders(collectPublicRoutes())
      .split(/\r?\n/)
      .filter((line) => line !== "" && !line.startsWith("#") && !/^\s/.test(line)).length;
    expect(headerRuleCount).toBeLessThanOrEqual(100);
  });

  it("repository外やrepository rootをbuild出力として受け付けない", () => {
    expect(() => assertOutputDirectory(".", "/workspace/app")).toThrow();
    expect(() => assertOutputDirectory("../dist", "/workspace/app")).toThrow();
    expect(assertOutputDirectory("dist/client", "/workspace/app")).toBe("/workspace/app/dist/client");
  });

  it.each(["http://localhost/app.js", "http://127.0.0.2/app.js", "http://[::1]:3000/app.js"])(
    "loopback URL %s が生成HTMLに残っていたら拒否する",
    (url) => {
      expect(() => assertNoLoopbackUrls("/", `<script src="${url}"></script>`)).toThrow(
        `[static-build] / contains a loopback URL (${url})`,
      );
    },
  );
});

import { type APIResponse, expect, request as requestFactory, test } from "@playwright/test";
import {
  CSR_SHELL_DYNAMIC_ROUTES,
  CSR_SHELL_STATIC_ROUTES,
  collectPublicRoutes,
  getCanonicalRoute,
} from "../../scripts/staticSite";

const DEPLOYED_ROUTES = [
  { path: "/", heading: /シフトのやり取りを/ },
  { path: "/features", heading: /シフトリ\s*で、希望回収から確定までひとつに/ },
  { path: "/faq", heading: "よくある質問" },
  { path: "/howto", heading: "使い方・ヘルプ" },
  { path: "/contact", heading: "お問い合わせ" },
  { path: "/demo/flow", heading: "シフトを募集してみよう" },
  { path: "/demo/shiftboard", heading: "勤務時間入力デモ" },
  { path: "/features/", heading: /シフトリ\s*で、希望回収から確定までひとつに/ },
] as const;

const ANDROID_CHROME_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro Build/AP3A.241105.008) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

function getHead(html: string): string {
  return html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
}

function getCanonical(html: string): string | undefined {
  const tag = getHead(html)
    .match(/<link\b[^>]*>/gi)
    ?.find((candidate) => /\brel=["']canonical["']/i.test(candidate));
  return tag?.match(/\bhref=["']([^"']*)["']/i)?.[1];
}

function materializeDynamicRoute(route: string): string {
  return route.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "preview-$1");
}

async function expectNoRedirect(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200);
  expect(response.headers().location).toBeUndefined();
}

test.describe("デプロイ済み静的サイト", { tag: ["@release", "@deployed"] }, () => {
  test("全公開URLがno-slash canonicalのSSG HTMLを返す", async ({ request }) => {
    for (const route of collectPublicRoutes(process.cwd())) {
      const canonical = new URL(getCanonicalRoute(route), "https://shiftori.app").href;
      const paths = route === "/" ? [route] : [route, `${route}/`];

      for (const path of paths) {
        const response = await request.get(path, { maxRedirects: 0 });
        await expectNoRedirect(response);

        const html = await response.text();
        expect(html, `${path} must contain server-rendered content`).toMatch(/<h1[\s>]/i);
        expect(getCanonical(html), `${path} canonical`).toBe(canonical);
        expect(html).not.toContain("data-spa-fallback");

        if (path.endsWith("/") && path !== "/") {
          expect(response.headers().link).toContain(`<${canonical}>; rel="canonical"`);
        }
      }
    }

    const queryResponse = await request.get("/features/?utm_source=preview", { maxRedirects: 0 });
    await expectNoRedirect(queryResponse);
    expect(getCanonical(await queryResponse.text())).toBe("https://shiftori.app/features");
  });

  test("認証・Capability URLだけが中立なCSR shellを返す", async ({ request }) => {
    const routes = [...CSR_SHELL_STATIC_ROUTES, ...CSR_SHELL_DYNAMIC_ROUTES.map(materializeDynamicRoute)];

    for (const route of routes) {
      for (const path of [route, `${route}/`]) {
        const response = await request.get(path, { maxRedirects: 0 });
        await expectNoRedirect(response);

        const html = await response.text();
        const head = getHead(html);
        expect(getCanonical(html), `${path} must not inherit a public canonical`).toBeUndefined();
        expect(head).toMatch(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i);
        expect(head).toMatch(/<meta\b[^>]*name=["']referrer["'][^>]*content=["']no-referrer["']/i);
        expect(html).not.toMatch(/<h1[\s>]/i);
        expect(response.headers()["cache-control"]).toContain("no-store");
        expect(response.headers()["x-robots-tag"]).toContain("noindex");
        expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      }
    }

    const capabilityResponse = await request.get("/manager-invite?token=preview-dummy", {
      maxRedirects: 0,
    });
    await expectNoRedirect(capabilityResponse);
    expect(capabilityResponse.headers()["referrer-policy"]).toBe("no-referrer");
    expect(await capabilityResponse.text()).not.toContain("preview-dummy");
  });

  test("未知URL、cache reset、hashed assetのHTTP契約を守る", async ({ request }) => {
    for (const path of [
      "/__preview-404-probe",
      "/__preview-404-probe/",
      "/articles/not-a-real-slug",
      "/articles/not-a-real-slug/",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
      expect(response.headers().location).toBeUndefined();
      expect(await response.text()).toContain("ページが見つかりません");
    }

    for (const path of ["/cache-reset", "/cache-reset/"]) {
      const cacheReset = await request.get(path, { maxRedirects: 0 });
      await expectNoRedirect(cacheReset);
      expect(cacheReset.headers()["clear-site-data"]).toBe('"cache"');
      expect(cacheReset.headers()["cache-control"]).toContain("no-store");
    }

    const top = await request.get("/", { maxRedirects: 0 });
    const html = await top.text();
    const assetPath = html.match(/<script\b[^>]*\bsrc=["'](\/[^"']+\.js)["']/i)?.[1];
    expect(assetPath).toBeDefined();

    const asset = await request.get(assetPath as string, { maxRedirects: 0 });
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toMatch(/javascript/);
    expect(asset.headers()["content-type"]).not.toMatch(/text\/html/);

    const missingAsset = await request.get("/assets/__missing-preview-probe.js", { maxRedirects: 0 });
    expect(missingAsset.status()).toBe(404);
    expect(missingAsset.headers().location).toBeUndefined();

    const sitemap = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["content-type"]).toMatch(/xml/);
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("Android Chrome相当でもslash URLをredirectせず終端する", async ({ baseURL }) => {
    if (!baseURL) throw new Error("Deployed Smoke requires a configured baseURL.");
    const androidRequest = await requestFactory.newContext({
      baseURL,
      extraHTTPHeaders: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "User-Agent": ANDROID_CHROME_USER_AGENT,
      },
    });

    try {
      for (const path of [
        "/features",
        "/features/",
        "/login",
        "/login/",
        "/manager-invite?token=preview-dummy",
        "/shiftboard/preview-dummy",
        "/shiftboard/preview-dummy/",
        "/cache-reset",
        "/cache-reset/",
      ]) {
        await expectNoRedirect(await androidRequest.get(path, { maxRedirects: 0 }));
      }

      for (const path of ["/articles/not-a-real-slug", "/articles/not-a-real-slug/"]) {
        const response = await androidRequest.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(404);
        expect(response.headers().location).toBeUndefined();
      }
    } finally {
      await androidRequest.dispose();
    }
  });

  test("主要公開ページをhydrationできる", async ({ baseURL, page }) => {
    if (!baseURL) throw new Error("Deployed Smoke requires a configured baseURL.");
    const expectedOrigin = new URL(baseURL).origin;
    const runtimeErrors: string[] = [];

    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat|server rendered|validateDOMNesting/i.test(message.text())) {
        runtimeErrors.push(message.text());
      }
    });

    for (const route of DEPLOYED_ROUTES) {
      const response = await page.goto(route.path);
      expect(response?.ok(), `${route.path} returned ${response?.status() ?? "no response"}`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === route.path);

      if (route.path === "/faq") {
        await page.getByRole("searchbox", { name: "よくある質問を検索" }).fill("該当しない確認用キーワード");
        await expect(page.getByText("該当する質問が見つかりません")).toBeVisible();
      }
      if (route.path === "/demo/flow") {
        await page.getByRole("button", { name: /2\s*提出/ }).click();
        await expect(page.getByRole("heading", { level: 1, name: "シフトを提出してみよう" })).toBeVisible();
      }
      if (route.path === "/demo/shiftboard") {
        await expect(page.getByRole("button", { name: "操作デモを開始" })).toBeVisible();
      }
    }

    expect(runtimeErrors).toEqual([]);
  });

  test("CSR shellと404をブラウザで描画できる", async ({ baseURL, page }) => {
    if (!baseURL) throw new Error("Deployed Smoke requires a configured baseURL.");
    const expectedOrigin = new URL(baseURL).origin;
    const runtimeErrors: string[] = [];

    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat|server rendered|validateDOMNesting/i.test(message.text())) {
        runtimeErrors.push(message.text());
      }
    });

    const loginResponse = await page.goto("/login");
    expect(loginResponse?.status()).toBe(200);
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/login");
    await expect(page.getByRole("heading", { level: 1, name: "シフトリにログイン" })).toBeVisible();

    const forgotPasswordResponse = await page.goto("/forgot-password/");
    expect(forgotPasswordResponse?.status()).toBe(200);
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/forgot-password/");
    await expect(page.getByRole("heading", { level: 1, name: "パスワードを再設定" })).toBeVisible();

    const notFoundResponse = await page.goto("/__preview-404-probe");
    expect(notFoundResponse?.status()).toBe(404);
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/__preview-404-probe");
    await expect(page.getByRole("heading", { level: 1, name: "ページが見つかりません" })).toBeVisible();

    expect(runtimeErrors).toEqual([]);
  });
});

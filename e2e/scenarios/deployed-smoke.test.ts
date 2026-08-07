import { type APIResponse, expect, type Page, request as requestFactory, test } from "@playwright/test";
import { getCanonicalRoute } from "../../scripts/staticSite";

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

async function expectNoRedirect(response: APIResponse, path: string): Promise<void> {
  expect(response.status(), path).toBe(200);
  expect(response.headers().location, path).toBeUndefined();
}

async function expectNeutralShell(response: APIResponse, path: string): Promise<void> {
  await expectNoRedirect(response, path);

  const html = await response.text();
  const head = getHead(html);
  expect(getCanonical(html), `${path} must not inherit a public canonical`).toBeUndefined();
  expect(head).toMatch(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i);
  expect(head).toMatch(/<meta\b[^>]*name=["']referrer["'][^>]*content=["'][^"']*no-referrer["']/i);
  expect(html).not.toMatch(/<h1[\s>]/i);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
}

async function expectHydrated(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-app-hydrated", "true", { timeout: 15_000 });
}

test.describe("デプロイ済み静的サイト", { tag: ["@release", "@deployed"] }, () => {
  test("代表公開route、shell、404をHTTPで確認する", async ({ baseURL, request }) => {
    if (!baseURL) throw new Error("Deployed Smoke requires a configured baseURL.");

    for (const route of ["/", "/features"] as const) {
      const canonical = new URL(getCanonicalRoute(route), "https://shiftori.app").href;
      const paths = route === "/" ? [route] : [route, `${route}/`];

      for (const path of paths) {
        const response = await request.get(path, { maxRedirects: 0 });
        await expectNoRedirect(response, path);

        const html = await response.text();
        expect(response.headers()["content-type"], path).toMatch(/text\/html/i);
        expect(html, `${path} must contain server-rendered content`).toMatch(/<h1[\s>]/i);
        expect(getCanonical(html), `${path} canonical`).toBe(canonical);
        expect(html).not.toContain("data-spa-fallback");

        if (path.endsWith("/") && path !== "/") {
          expect(response.headers().link).toContain(`<${canonical}>; rel="canonical"`);
        }
      }
    }

    await expectNeutralShell(await request.get("/login", { maxRedirects: 0 }), "/login");

    const capabilityResponse = await request.get("/manager-invite?token=preview-dummy", {
      maxRedirects: 0,
    });
    await expectNoRedirect(capabilityResponse, "/manager-invite?token=preview-dummy");
    expect(capabilityResponse.headers()["referrer-policy"]).toBe("no-referrer");
    expect(await capabilityResponse.text()).not.toContain("preview-dummy");

    const notFound = await request.get("/__smoke-404", { maxRedirects: 0 });
    expect(notFound.status()).toBe(404);
    expect(notFound.headers().location).toBeUndefined();
    expect(await notFound.text()).toContain("ページが見つかりません");

    const androidRequest = await requestFactory.newContext({
      baseURL,
      extraHTTPHeaders: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "User-Agent": ANDROID_CHROME_USER_AGENT,
      },
    });

    try {
      await expectNoRedirect(await androidRequest.get("/features/", { maxRedirects: 0 }), "/features/");
    } finally {
      await androidRequest.dispose();
    }
  });

  test("代表公開ページをブラウザで起動する", async ({ baseURL, page }) => {
    if (!baseURL) throw new Error("Deployed Smoke requires a configured baseURL.");
    const expectedOrigin = new URL(baseURL).origin;
    const runtimeErrors: string[] = [];

    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat|server rendered|validateDOMNesting/i.test(message.text())) {
        runtimeErrors.push(message.text());
      }
    });

    const response = await page.goto("/");
    expect(response?.ok(), `/ returned ${response?.status() ?? "no response"}`).toBe(true);
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/");
    await expect(page.getByRole("heading", { level: 1, name: /シフトのやり取りを/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /登録不要でデモを見る/ }).first()).toBeVisible();
    await expectHydrated(page);

    expect(runtimeErrors).toEqual([]);
  });
});

import { expect, test } from "@playwright/test";

const DEPLOYED_ROUTES = [
  { path: "/", heading: /シフトのやり取りを/ },
  { path: "/features", heading: /シフトリ\s*で、希望回収から確定までひとつに/ },
  { path: "/faq", heading: "よくある質問" },
  { path: "/howto", heading: "使い方・ヘルプ" },
  { path: "/contact", heading: "お問い合わせ" },
] as const;

test.describe("デプロイ済み公開URLのSmoke", { tag: ["@release", "@deployed"] }, () => {
  test("TOPと主要公開ページが表示できる", async ({ baseURL, page }) => {
    if (!baseURL) throw new Error("Deployed Smoke requires a configured baseURL.");
    const expectedOrigin = new URL(baseURL).origin;

    for (const route of DEPLOYED_ROUTES) {
      const response = await page.goto(route.path);
      expect(response?.ok(), `${route.path} returned ${response?.status() ?? "no response"}`).toBe(true);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page).toHaveURL((url) => {
        const normalizedPath = url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "");
        return url.origin === expectedOrigin && normalizedPath === route.path;
      });
    }
  });
});

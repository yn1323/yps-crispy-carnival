import { expect, test } from "@playwright/test";

test.describe("認証後のページ遷移チェック", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("認証後、マイページにアクセスできること", async ({ page }) => {
    await expect(page).toHaveURL("/mypage");
  });
});

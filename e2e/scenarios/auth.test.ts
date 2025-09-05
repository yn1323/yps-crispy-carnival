import { expect, test } from "@playwright/test";

test.describe("認証後のページ遷移チェック", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // TODO: 初回はユーザー登録に遷移するため
  test.skip("認証後、マイページにアクセスできること", async ({ page }) => {
    await expect(page).toHaveURL("/mypage");
  });
});

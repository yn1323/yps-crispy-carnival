import { expect, test } from "@playwright/test";

test.describe("店舗一覧", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/shops");
  });

  test("店舗一覧が表示されること", async ({ page }) => {
    // ページタイトルが表示される（headingなのでgetByRole）
    await expect(page.getByRole("heading", { name: "店舗一覧" })).toBeVisible();

    // 店舗カードが表示される（groupロールを含むリンク）
    const shopCards = page.getByRole("link").filter({ has: page.getByRole("group") });
    await expect(shopCards.first()).toBeVisible();
  });

  test("店舗カードに営業時間とスタッフ数が表示されること", async ({ page }) => {
    // 店舗カードに営業時間が表示される（HH:MM - HH:MM形式、複数あるので first()）
    await expect(page.getByText(/\d{2}:\d{2} - \d{2}:\d{2}/).first()).toBeVisible();

    // 店舗カードにスタッフ数が表示される（X名形式、複数あるので first()）
    await expect(page.getByText(/\d+名/).first()).toBeVisible();
  });

  test("店舗カードをクリックすると詳細ページに遷移すること", async ({ page }) => {
    // 最初の店舗カードをクリック（groupロールを含むリンク）
    await page
      .getByRole("link")
      .filter({ has: page.getByRole("group") })
      .first()
      .click();

    // 店舗詳細ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // 店舗情報タブが表示される
    await expect(page.getByRole("tab", { name: "店舗情報" })).toBeVisible();
  });

  test("新規店舗ボタンをクリックすると登録ページに遷移すること", async ({ page }) => {
    // 新規店舗ボタンをクリック
    await page.getByRole("link", { name: "新規店舗" }).click();

    // 店舗登録ページに遷移
    await expect(page).toHaveURL("/shops/new");
  });
});

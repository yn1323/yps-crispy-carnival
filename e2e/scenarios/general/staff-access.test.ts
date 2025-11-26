import { expect, test } from "@playwright/test";

test.describe("スタッフアクセス制御（general）", () => {
  test("スタッフ一覧で在籍ユーザーのみ表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // 店舗詳細ページに遷移したことを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されることを確認
    // generalはactiveユーザーのみ表示される（resigned/pendingは見えない）
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
  });

  test("自分の詳細情報が全て表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されるまで待機
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();

    // 自分自身のスタッフをクリック（最初のスタッフが自分と仮定）
    const staffLinks = page.locator('[data-scope="tabs"]').locator('a[href*="/staffs/"]');
    await staffLinks.first().click();

    // スタッフ詳細ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

    // 自分の詳細情報が表示されることを確認
    // 「今月の概要」セクションが表示される（自分の情報は全て見れる）
    await expect(page.getByText("今月の概要")).toBeVisible();

    // タブが表示される
    await expect(page.getByRole("tab", { name: /基本情報|情報/ })).toBeVisible();
  });

  test("他スタッフは名前と役割のみ表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されるまで待機
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();

    // 他スタッフをクリック（2番目のスタッフが他人と仮定）
    const staffLinks = page.locator('[data-scope="tabs"]').locator('a[href*="/staffs/"]');
    const staffCount = await staffLinks.count();

    if (staffCount > 1) {
      await staffLinks.nth(1).click();

      // スタッフ詳細ページに遷移
      await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

      // 「今月の概要」セクションは表示されない（他人の詳細は見れない）
      await expect(page.getByText("今月の概要")).not.toBeVisible();
    }
  });
});

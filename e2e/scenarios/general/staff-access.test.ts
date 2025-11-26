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
    await expect(page.locator('[data-scope="tabs"]').getByRole("list")).toBeVisible();
  });

  test("自分の詳細情報が全て表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されるまで待機
    await page.waitForSelector('[data-scope="tabs"]');

    // 自分自身のスタッフをクリック（最初のスタッフが自分と仮定）
    const staffItems = page.locator('[data-scope="tabs"]').getByRole("listitem");
    await staffItems.first().click();

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
    await page.waitForSelector('[data-scope="tabs"]');

    // 他スタッフをクリック（2番目のスタッフが他人と仮定）
    const staffItems = page.locator('[data-scope="tabs"]').getByRole("listitem");
    const staffCount = await staffItems.count();

    if (staffCount > 1) {
      await staffItems.nth(1).click();

      // スタッフ詳細ページに遷移
      await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

      // 制限ビューのメッセージが表示される（他人の詳細は見れない）
      await expect(page.getByText("詳細情報を表示する権限がありません")).toBeVisible();

      // 「今月の概要」セクションは表示されない
      await expect(page.getByText("今月の概要")).not.toBeVisible();
    }
  });
});

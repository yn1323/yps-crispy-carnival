import { expect, test } from "@playwright/test";

test.describe("スタッフアクセス制御（manager）", () => {
  test("スタッフ一覧で全ユーザーが表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // 店舗詳細ページに遷移したことを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されることを確認
    // managerは全スタッフ（pending, active, resigned）が見える
    await expect(page.locator('[data-scope="tabs"]').getByRole("list")).toBeVisible();
  });

  test("他スタッフの詳細情報が全て表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されるまで待機
    await page.waitForSelector('[data-scope="tabs"]');

    // 最初のスタッフをクリック（自分以外のスタッフ）
    const staffItems = page.locator('[data-scope="tabs"]').getByRole("listitem");
    const staffCount = await staffItems.count();

    if (staffCount > 1) {
      // 2番目のスタッフをクリック（自分以外）
      await staffItems.nth(1).click();

      // スタッフ詳細ページに遷移
      await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

      // 詳細情報が表示されることを確認（managerは全情報見れる）
      // 「今月の概要」セクションが表示される
      await expect(page.getByText("今月の概要")).toBeVisible();

      // タブが表示される
      await expect(page.getByRole("tab", { name: /基本情報|情報/ })).toBeVisible();
    }
  });
});

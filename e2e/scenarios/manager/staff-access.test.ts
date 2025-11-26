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

    // TODO: 全スタッフ（pending, active, resigned）が表示されることを確認
    // 実装後に具体的なアサーションを追加
  });

  test("他スタッフの詳細情報が全て表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // TODO: スタッフをクリックして詳細ページへ遷移
    // TODO: 勤務時間、所属店舗などの詳細情報が表示されることを確認
  });
});

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

    // TODO: activeユーザーのみ表示され、resigned（退職者）は見えないことを確認
    // 実装後に具体的なアサーションを追加
  });

  test("自分の詳細情報が全て表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // TODO: 自分自身をクリックして詳細ページへ遷移
    // TODO: 勤務時間、所属店舗などの詳細情報が表示されることを確認
  });

  test("他スタッフは名前と役割のみ表示される", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // TODO: 他スタッフをクリックして詳細ページへ遷移
    // TODO: 名前と役割のみ表示され、勤務時間・所属店舗などは見えないことを確認
  });
});

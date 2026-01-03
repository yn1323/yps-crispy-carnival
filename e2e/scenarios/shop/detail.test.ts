import { expect, test } from "@playwright/test";
import { goToFirstShopDetail } from "@/e2e/helpers/navigation";

test.describe("店舗詳細", () => {
  test.beforeEach(async ({ page }) => {
    await goToFirstShopDetail(page);
  });

  test("店舗詳細ページが表示されること", async ({ page }) => {
    // 店舗詳細の内容が表示される
    await expect(page.getByText("営業時間")).toBeVisible();
    await expect(page.getByText("シフト提出期限")).toBeVisible();
    await expect(page.getByText("シフト入力の時間単位")).toBeVisible();
  });

  test("編集ボタンをクリックすると編集ページに遷移すること", async ({ page }) => {
    // 編集ボタンをクリック
    await page.getByRole("button", { name: "編集" }).click();

    // 編集ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+\/edit$/);

    // 店舗編集ページのタイトルが表示される
    await expect(page.getByRole("heading", { name: "店舗編集" })).toBeVisible();
  });

  test("店舗一覧に戻るボタンが機能すること", async ({ page }) => {
    // 「店舗一覧に戻る」ボタンをクリック
    await page.getByRole("button", { name: "店舗一覧に戻る" }).click();

    // 店舗一覧ページに遷移
    await expect(page).toHaveURL("/shops");
  });
});

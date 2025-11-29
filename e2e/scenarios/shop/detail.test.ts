import { expect, test } from "@playwright/test";
import { goToFirstShop, goToStaffTab } from "@/e2e/helpers/navigation";

test.describe("店舗詳細", () => {
  test.beforeEach(async ({ page }) => {
    await goToFirstShop(page);
  });

  test("店舗情報タブがデフォルトで表示されること", async ({ page }) => {
    // 店舗情報タブがアクティブ
    await expect(page.getByRole("tab", { name: "店舗情報" })).toHaveAttribute("aria-selected", "true");

    // 店舗情報の内容が表示される
    await expect(page.getByText("営業時間")).toBeVisible();
    await expect(page.getByText("シフト提出期限")).toBeVisible();
  });

  test("スタッフタブに切り替えられること", async ({ page }) => {
    // スタッフタブをクリック
    await goToStaffTab(page);

    // スタッフタブがアクティブ
    await expect(page.getByRole("tab", { name: "スタッフ" })).toHaveAttribute("aria-selected", "true");

    // スタッフ検索ボックスが表示される
    await expect(page.getByPlaceholder("名前・メールで検索...")).toBeVisible();
  });

  test("編集ボタンをクリックすると編集ページに遷移すること", async ({ page }) => {
    // 編集ボタンをクリック
    await page.getByRole("button", { name: "編集" }).click();

    // 編集ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+\/edit$/);

    // 店舗編集ページのタイトルが表示される
    await expect(page.getByRole("heading", { name: "店舗編集" })).toBeVisible();
  });

  test("店舗一覧に戻るリンクが機能すること", async ({ page }) => {
    // 「店舗一覧に戻る」リンクをクリック
    await page.getByRole("link", { name: "店舗一覧に戻る" }).click();

    // 店舗一覧ページに遷移
    await expect(page).toHaveURL("/shops");
  });
});

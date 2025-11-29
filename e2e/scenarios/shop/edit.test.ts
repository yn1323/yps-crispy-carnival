import { expect, test } from "@playwright/test";
import { goToFirstShop } from "@/e2e/helpers/navigation";

test.describe("店舗編集", () => {
  test.beforeEach(async ({ page }) => {
    await goToFirstShop(page);
    // 編集ページへ遷移
    await page.getByRole("button", { name: "編集" }).click();
    await expect(page).toHaveURL(/\/shops\/[^/]+\/edit$/);
  });

  test("店舗名を変更して保存できること", async ({ page }) => {
    // 現在の店舗名を取得
    const shopNameInput = page.getByLabel("店舗名");
    const originalName = await shopNameInput.inputValue();

    // 店舗名を変更
    const newName = `${originalName}_編集済み`;
    await shopNameInput.fill(newName);

    // 更新ボタンをクリック
    await page.getByRole("button", { name: "更新" }).click();

    // トースト確認（複数表示される可能性があるので first()）
    await expect(page.getByText("店舗情報を更新しました").first()).toBeVisible();

    // 店舗詳細ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // 変更後の店舗名が表示される
    await expect(page.getByRole("heading", { name: newName })).toBeVisible();

    // 元の名前に戻す（クリーンアップ）
    await page.getByRole("button", { name: "編集" }).click();
    await page.getByLabel("店舗名").fill(originalName);
    await page.getByRole("button", { name: "更新" }).click();
    await expect(page.getByText("店舗情報を更新しました").first()).toBeVisible();
  });

  test("店舗詳細に戻るボタンが機能すること", async ({ page }) => {
    // 「店舗詳細に戻る」ボタンをクリック
    await page.getByRole("button", { name: "店舗詳細に戻る" }).click();

    // 店舗詳細ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);
  });
});

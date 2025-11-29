import { expect, type Page } from "@playwright/test";

/**
 * 店舗一覧から最初の店舗詳細ページへ移動
 */
export const goToFirstShop = async (page: Page) => {
  await page.goto("/shops");
  // 店舗カードのリンクをクリック
  await page.locator('a[href^="/shops/"]').first().click();
  await expect(page).toHaveURL(/\/shops\/[^/]+$/);
};

/**
 * スタッフタブをクリックしてスタッフ一覧を表示
 */
export const goToStaffTab = async (page: Page) => {
  await page.getByRole("tab", { name: "スタッフ" }).click();
};

/**
 * スタッフ一覧が表示されるまで待機
 */
export const waitForStaffList = async (page: Page) => {
  await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
};

/**
 * 店舗一覧 → 店舗詳細 → スタッフタブ → スタッフ一覧表示まで一括で実行
 */
export const goToStaffList = async (page: Page) => {
  await goToFirstShop(page);
  await goToStaffTab(page);
  await waitForStaffList(page);
};

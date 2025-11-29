import { expect, type Page } from "@playwright/test";

/**
 * 店舗一覧から最初の店舗詳細ページへ移動
 */
export const goToFirstShop = async (page: Page) => {
  await page.goto("/shops");
  // 店舗カード（group）を含むリンクをクリック
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("group") })
    .first()
    .click();
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

/**
 * スタッフ追加モーダルを開く
 */
export const openStaffAddModal = async (page: Page) => {
  await page.getByRole("button", { name: "スタッフを追加" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

/**
 * スタッフ詳細ページへ移動（スタッフ一覧から）
 */
export const goToStaffDetail = async (page: Page) => {
  // スタッフカードのリンクをクリック（URL構造で判定）
  await page.locator('a[href*="/staffs/"]').first().click();
  // URL: /shops/{shopId}/staffs/{staffId}
  await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);
};

/**
 * スタッフ編集ページへ移動（スタッフ詳細から）
 */
export const goToStaffEditFromDetail = async (page: Page) => {
  await page.getByRole("button", { name: "編集" }).click();
  // URL: /shops/{shopId}/staffs/{staffId}/edit
  await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+\/edit$/);
};

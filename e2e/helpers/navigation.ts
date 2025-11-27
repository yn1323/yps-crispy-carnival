import { type Page, expect } from "@playwright/test";

/**
 * 店舗一覧から最初の店舗詳細ページへ移動
 */
export const goToFirstShop = async (page: Page) => {
	await page.goto("/shops");
	await page.getByRole("group").first().click();
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
 * スタッフリンクのLocatorを取得
 */
export const getStaffLinks = (page: Page) => {
	return page.locator('[data-scope="tabs"]').locator('a[href*="/staffs/"]');
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
 * 指定したインデックスのスタッフ詳細ページへ移動
 */
export const goToStaffDetail = async (page: Page, index: number) => {
	const staffLinks = getStaffLinks(page);
	await staffLinks.nth(index).click();
	await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);
};

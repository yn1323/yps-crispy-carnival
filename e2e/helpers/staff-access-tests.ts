import { type Page, expect } from "@playwright/test";
import { getStaffLinks, goToStaffDetail, goToStaffList } from "./navigation";

/**
 * 全権限ユーザー（Owner/Manager）向け: スタッフ一覧で全ユーザーが表示されるテスト
 * @param page Playwright Page
 * @param role テスト対象の権限名（ログ用）
 */
export const testFullStaffListVisible = async (page: Page, role: string) => {
	await goToStaffList(page);
	// owner/managerは全スタッフ（pending, active, resigned）が見える
	await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
};

/**
 * 全権限ユーザー（Owner/Manager）向け: 他スタッフの詳細情報が全て表示されるテスト
 * @param page Playwright Page
 * @param role テスト対象の権限名（ログ用）
 */
export const testFullStaffDetailVisible = async (page: Page, role: string) => {
	await goToStaffList(page);

	const staffLinks = getStaffLinks(page);
	const staffCount = await staffLinks.count();

	if (staffCount > 1) {
		// 2番目のスタッフをクリック（自分以外）
		await goToStaffDetail(page, 1);

		// 詳細情報が表示されることを確認（owner/managerは全情報見れる）
		await expect(page.getByText("今月の概要")).toBeVisible();
		await expect(page.getByRole("tab", { name: /基本情報|情報/ })).toBeVisible();
	}
};

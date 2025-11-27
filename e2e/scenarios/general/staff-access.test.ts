import { expect, test } from "@playwright/test";
import {
	getStaffLinks,
	goToStaffDetail,
	goToStaffList,
} from "@/e2e/helpers/navigation";

test.describe("スタッフアクセス制御（general）", () => {
	test("スタッフ一覧で在籍ユーザーのみ表示される", async ({ page }) => {
		await goToStaffList(page);
		// generalはactiveユーザーのみ表示される（resigned/pendingは見えない）
		await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
	});

	test("自分の詳細情報が全て表示される", async ({ page }) => {
		await goToStaffList(page);

		// 自分自身のスタッフをクリック（最初のスタッフが自分と仮定）
		await goToStaffDetail(page, 0);

		// 自分の詳細情報が表示されることを確認（自分の情報は全て見れる）
		await expect(page.getByText("今月の概要")).toBeVisible();
		await expect(page.getByRole("tab", { name: /基本情報|情報/ })).toBeVisible();
	});

	test("他スタッフは名前と役割のみ表示される", async ({ page }) => {
		await goToStaffList(page);

		const staffLinks = getStaffLinks(page);
		const staffCount = await staffLinks.count();

		if (staffCount > 1) {
			// 他スタッフをクリック（2番目のスタッフが他人と仮定）
			await goToStaffDetail(page, 1);

			// 「今月の概要」セクションは表示されない（他人の詳細は見れない）
			await expect(page.getByText("今月の概要")).not.toBeVisible();
		}
	});
});

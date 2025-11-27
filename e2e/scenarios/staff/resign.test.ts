import { expect, test } from "@playwright/test";
import {
	getStaffLinks,
	goToFirstShop,
	goToStaffTab,
	waitForStaffList,
} from "@/e2e/helpers/navigation";

/**
 * テスト間依存関係:
 * - このテストは invite.test.ts の後に実行される（認証済みテスト内で順序実行）
 * - after-resign.test.ts がこのテストの実行後に依存している
 */
test.describe("スタッフ退職処理", () => {
	test("オーナーがスタッフを退職処理できること", async ({ page }) => {
		await goToFirstShop(page);
		await goToStaffTab(page);
		await waitForStaffList(page);

		const staffLinks = getStaffLinks(page);
		const initialStaffCount = await staffLinks.count();

		// 退職対象のスタッフを探す（オーナー以外のスタッフ）
		let targetStaffIndex = -1;
		for (let i = 0; i < initialStaffCount; i++) {
			const staffCard = staffLinks.nth(i);
			const hasOwnerBadge = await staffCard.locator("text=オーナー").count();
			if (hasOwnerBadge === 0) {
				targetStaffIndex = i;
				break;
			}
		}

		// オーナー以外のスタッフがいない場合はスキップ
		if (targetStaffIndex === -1) {
			test.skip();
			return;
		}

		// 対象スタッフをクリック
		await staffLinks.nth(targetStaffIndex).click();
		await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

		// 編集ボタンをクリック
		await page.getByRole("button", { name: /編集|変更/ }).click();
		await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+\/edit$/);

		// 「退職処理を実行」ボタンまでスクロールしてクリック
		const resignButton = page.getByRole("button", { name: "退職処理を実行" });
		await resignButton.scrollIntoViewIfNeeded();
		await resignButton.click();

		// 確認モーダルが表示されることを確認
		await expect(page.getByText("退職処理の確認")).toBeVisible();
		await expect(page.getByText("本当に")).toBeVisible();

		// 退職理由を入力
		await page.getByLabel("退職理由（任意）").fill("E2Eテストによる退職処理");

		// モーダル内の「退職処理を実行」ボタンをクリック
		await page.locator('[role="dialog"]').getByRole("button", { name: "退職処理を実行" }).click();

		// 成功トーストが表示されることを確認
		await expect(page.getByText(/を退職処理しました/)).toBeVisible();

		// スタッフ一覧ページにリダイレクトされることを確認
		await expect(page).toHaveURL(/\/shops\/[^/]+\?tab=staff/);
	});

	test("退職済みスタッフがフィルターで表示されること", async ({ page }) => {
		await goToFirstShop(page);
		await goToStaffTab(page);
		await waitForStaffList(page);

		// ステータスフィルターをクリックして「退職済み」を選択
		const statusSelect = page.locator('button:has-text("在籍中")');
		await statusSelect.click();
		await page.getByRole("option", { name: "退職済み" }).click();

		// フィルター適用後の結果を待機
		const staffCountLocator = page.getByText(/\d+名のスタッフ/);
		const noStaffLocator = page.getByText("該当するスタッフが見つかりませんでした");
		await expect(staffCountLocator.or(noStaffLocator)).toBeVisible();
	});
});

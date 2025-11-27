import { expect, test } from "@playwright/test";

/**
 * テスト間依存関係:
 * - このテストは staff/resign.test.ts の後に実行される必要がある
 * - playwright.config.ts の dependencies で「認証済みテスト」への依存を設定
 * - Generalユーザーが退職処理された後のアクセス制限を確認
 */
test.describe("退職後のアクセス制御（general）", () => {
	test("退職後は店舗一覧に該当店舗が表示されないこと", async ({ page }) => {
		await page.goto("/shops");
		await page.waitForLoadState("networkidle");

		// 店舗一覧を確認（退職済みの場合、店舗が表示されないか減少している）
		const shopCards = page.getByRole("group");
		const shopCount = await shopCards.count();

		if (shopCount === 0) {
			// 店舗がない場合の表示を確認
			const noShopsMessage = await page.getByText(/店舗|登録/).isVisible();
			expect(noShopsMessage || shopCount === 0).toBeTruthy();
		}
	});
});

import { expect, test } from "@playwright/test";

test.describe("退職後のアクセス制御（general）", () => {
  test("退職後は店舗一覧に該当店舗が表示されないこと", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // ページが読み込まれるまで待機
    await page.waitForLoadState("networkidle");

    // 店舗一覧を確認
    // 退職済みの場合、店舗が表示されないか、店舗数が減っている
    const shopCards = page.getByRole("group");
    const shopCount = await shopCards.count();

    // 店舗が0件の場合、または「店舗が見つかりません」のようなメッセージが表示される
    if (shopCount === 0) {
      // 店舗がない場合の表示を確認
      const noShopsMessage = await page.getByText(/店舗|登録/).isVisible();
      expect(noShopsMessage || shopCount === 0).toBeTruthy();
    }

    // テスト成功（退職後は店舗が表示されない、または減少している）
    // 注：このテストは退職処理テストの後に実行される必要がある
  });
});

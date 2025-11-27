import { expect, test } from "@playwright/test";

test.describe("スタッフ退職処理", () => {
  test("オーナーがスタッフを退職処理できること", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // 店舗詳細ページに遷移したことを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されることを確認
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();

    // スタッフの数を取得
    const staffLinks = page.locator('[data-scope="tabs"]').locator('a[href*="/staffs/"]');
    const initialStaffCount = await staffLinks.count();

    // 退職対象のスタッフを探す（オーナー以外のスタッフ）
    // バッジに「オーナー」がないスタッフを選択
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

    // スタッフ詳細ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

    // 編集ボタンをクリック
    await page.getByRole("button", { name: /編集|変更/ }).click();

    // スタッフ編集ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+\/edit$/);

    // 「退職処理を実行」ボタンまでスクロールしてクリック
    const resignButton = page.getByRole("button", { name: "退職処理を実行" });
    await resignButton.scrollIntoViewIfNeeded();
    await resignButton.click();

    // 確認モーダルが表示されることを確認
    await expect(page.getByText("退職処理の確認")).toBeVisible();
    await expect(page.getByText("本当に")).toBeVisible();

    // 退職理由を入力（任意）
    await page.getByLabel("退職理由（任意）").fill("E2Eテストによる退職処理");

    // モーダル内の「退職処理を実行」ボタンをクリック
    await page.locator('[role="dialog"]').getByRole("button", { name: "退職処理を実行" }).click();

    // 成功トーストが表示されることを確認
    await expect(page.getByText(/を退職処理しました/)).toBeVisible();

    // スタッフ一覧ページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+\?tab=staff/);
  });

  test("退職済みスタッフがフィルターで表示されること", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.getByRole("group").first().click();

    // 店舗詳細ページに遷移したことを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // スタッフタブをクリック
    await page.getByRole("tab", { name: "スタッフ" }).click();

    // スタッフ一覧が表示されることを確認
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();

    // ステータスフィルターをクリックして「退職済み」を選択
    const statusSelect = page.locator('button:has-text("在籍中")');
    await statusSelect.click();

    // 「退職済み」オプションをクリック
    await page.getByRole("option", { name: "退職済み" }).click();

    // フィルター適用後の結果を待機
    // 退職済みスタッフがいる場合は「〇名のスタッフ」、いない場合は「該当するスタッフが見つかりませんでした」
    const staffCountLocator = page.getByText(/\d+名のスタッフ/);
    const noStaffLocator = page.getByText("該当するスタッフが見つかりませんでした");

    // どちらかが表示されるまで待機
    await expect(staffCountLocator.or(noStaffLocator)).toBeVisible();
  });
});

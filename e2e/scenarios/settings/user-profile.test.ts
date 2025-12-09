import { expect, test } from "@playwright/test";

test.describe("ユーザー設定", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    // 設定ページのロード完了を待つ
    await expect(page.getByText("個人設定")).toBeVisible();
  });

  test("ユーザー名を変更できること", async ({ page }) => {
    // 名前フィールドを取得
    const nameInput = page.getByLabel("名前");
    await expect(nameInput).toBeVisible();

    // 現在の名前を取得
    const originalName = await nameInput.inputValue();

    // 名前を変更
    const newName = `テスト${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(newName);

    // 保存ボタンをクリック
    await page.getByRole("button", { name: "変更を保存" }).click();

    // 成功トースト確認
    await expect(page.getByText("ユーザー名を更新しました")).toBeVisible();

    // 元の名前に戻す
    await nameInput.clear();
    await nameInput.fill(originalName);
    await page.getByRole("button", { name: "変更を保存" }).click();
    await expect(page.getByText("ユーザー名を更新しました")).toBeVisible();
  });

  test("メールアドレスは変更できないこと", async ({ page }) => {
    // メールアドレスフィールドが無効化されていることを確認
    const emailInput = page.getByLabel("メールアドレス");
    await expect(emailInput).toBeDisabled();
  });
});

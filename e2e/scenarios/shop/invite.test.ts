import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2EInviteUrlFile } from "@/e2e/constants";

test.describe("招待URL発行", () => {
  test("スタッフを招待してURLを発行できること", async ({ page }) => {
    // 店舗一覧へ移動
    await page.goto("/shops");

    // 最初の店舗をクリック
    await page.locator("a[href^='/shops/']").first().click();

    // 店舗詳細ページに遷移したことを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);

    // 招待タブ（またはリンク）をクリック
    await page.getByRole("link", { name: /招待/i }).click();

    // 招待ページに遷移したことを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+\/invite/);

    // 表示名を入力
    const displayName = "E2Eテストユーザー";
    await page.getByLabel("表示名").fill(displayName);

    // 招待メールを送るボタンをクリック
    await page.getByRole("button", { name: /招待メールを送る/i }).click();

    // 招待完了メッセージを確認
    await expect(page.getByText("招待メールを送りました")).toBeVisible();

    // 招待URLを取得（gray.50の背景のBox内にあるテキスト）
    const urlElement = page.locator("text=/http.*invite\\?token=/");
    const inviteUrl = await urlElement.textContent();

    expect(inviteUrl).toBeTruthy();
    expect(inviteUrl).toContain("/invite?token=");

    // URLをファイルに保存（User Bのテストで使用）
    const tmpDir = path.dirname(E2EInviteUrlFile);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(E2EInviteUrlFile, inviteUrl ?? "");
  });
});

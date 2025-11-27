import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2EInviteUrlFile } from "@/e2e/constants";
import { goToFirstShop, goToStaffTab } from "@/e2e/helpers/navigation";

/**
 * テスト間依存関係:
 * - このテストで生成された招待URLは userB/accept.test.ts で使用される
 * - 招待URLは E2EInviteUrlFile に保存される
 */
test.describe("招待URL発行", () => {
  test("スタッフを招待してURLを発行できること", async ({ page }) => {
    await goToFirstShop(page);
    await goToStaffTab(page);

    // 「スタッフを招待」ボタンをクリック
    await page.getByText("スタッフを招待").click();
    await expect(page).toHaveURL(/\/shops\/[^/]+\/invite/);

    // 表示名とメールアドレスを入力
    const displayName = "E2Eテストユーザー";
    const mail = "e2e-test-user@example.com";

    await page.getByLabel("表示名").fill(displayName);
    await page.getByLabel("メールアドレス").fill(mail);

    // 招待メールを送るボタンをクリック
    await page.getByRole("button", { name: /招待メールを送る/i }).click();

    // 招待完了メッセージを確認
    await expect(page.getByText("招待メールを送りました")).toBeVisible();

    // 招待URLを取得
    const urlElement = page.locator("text=/http.*invite\\?token=/");
    const inviteUrl = await urlElement.textContent();

    expect(inviteUrl).toBeTruthy();
    expect(inviteUrl).toContain("/invite?token=");

    // URLをファイルに保存（userB/accept.test.ts で使用）
    const tmpDir = path.dirname(E2EInviteUrlFile);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(E2EInviteUrlFile, inviteUrl ?? "");
  });
});

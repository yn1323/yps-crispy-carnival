import * as fs from "node:fs";
import { expect, test } from "@playwright/test";
import { E2ETmpInviteUrl } from "@/e2e/constants";

test.describe("マネージャー招待受け入れ", () => {
  test("招待リンクから店舗に参加できること", async ({ page }) => {
    // tmpファイルから招待URLを取得
    if (!fs.existsSync(E2ETmpInviteUrl)) {
      test.skip(true, "招待URLが存在しません。先にcreate.testを実行してください。");
      return;
    }

    const inviteUrl = fs.readFileSync(E2ETmpInviteUrl, "utf-8").trim();
    expect(inviteUrl).toContain("/invite?token=");

    // 招待URLにアクセス
    await page.goto(inviteUrl);

    // 招待ページが表示される
    await expect(page.getByText("店舗への招待")).toBeVisible();

    // 名前とロールが表示される
    await expect(page.getByText("あなたの名前")).toBeVisible();
    await expect(page.getByText("マネージャー")).toBeVisible();

    // 「この店舗に参加する」ボタンをクリック
    await page.getByRole("button", { name: "この店舗に参加する" }).click();

    // 成功トースト確認
    await expect(page.getByText(/に参加しました/)).toBeVisible();

    // 店舗詳細ページに遷移
    await expect(page).toHaveURL(/\/shops\/[^/]+$/);
  });

  test("無効なトークンでエラーが表示されること", async ({ page }) => {
    // 無効なトークンでアクセス
    await page.goto("/invite?token=invalid-token-12345");

    // エラーメッセージが表示される
    await expect(page.getByText("招待が見つかりません")).toBeVisible();
  });

  test("トークンなしでエラーが表示されること", async ({ page }) => {
    // トークンなしでアクセス
    await page.goto("/invite");

    // エラーメッセージが表示される
    await expect(page.getByText("無効なリンク")).toBeVisible();
  });
});

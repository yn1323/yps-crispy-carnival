import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { E2EInviteUrlFile } from "@/e2e/constants";

test.describe("招待受け入れ", () => {
  test("無効な招待URLでエラーが表示されること", async ({ page }) => {
    // 存在しないトークンでアクセス
    await page.goto("/invite?token=invalid-token-12345");

    // エラーメッセージが表示されることを確認
    await expect(page.getByText("招待が見つかりません")).toBeVisible();
  });

  test("招待URLから店舗に参加できること", async ({ page }) => {
    // User Aが発行した招待URLをファイルから読み込み
    if (!fs.existsSync(E2EInviteUrlFile)) {
      test.skip();
      return;
    }

    const inviteUrl = fs.readFileSync(E2EInviteUrlFile, "utf-8").trim();
    if (!inviteUrl) {
      test.skip();
      return;
    }

    // 招待URLにアクセス
    await page.goto(inviteUrl);

    // 招待情報が表示されることを確認
    await expect(page.getByText("店舗への招待")).toBeVisible();

    // 「この店舗に参加する」ボタンをクリック
    await page.getByRole("button", { name: "この店舗に参加する" }).click();

    // 「参加しました！」メッセージを確認
    await expect(page.getByText("参加しました！")).toBeVisible();

    // 店舗ページへ移動ボタンが表示されることを確認
    await expect(page.getByRole("link", { name: "店舗ページへ移動" })).toBeVisible();
  });
});

import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import { E2ETmpInviteUrl } from "@/e2e/constants";
import { goToStaffList, openManagerInviteModal } from "@/e2e/helpers/navigation";

test.describe("マネージャー招待作成", () => {
  test.beforeEach(async ({ page }) => {
    await goToStaffList(page);
  });

  test("モーダルが開閉できること", async ({ page }) => {
    await openManagerInviteModal(page);

    // キャンセルでモーダル閉じる
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("招待リンクを作成できること", async ({ page }) => {
    await openManagerInviteModal(page);

    // 名前を入力
    const managerName = `招待テスト_${Date.now()}`;
    await page.getByLabel("名前").fill(managerName);

    // 招待リンクを作成
    await page.getByRole("button", { name: "招待リンクを作成" }).click();

    // 成功トースト確認
    await expect(page.getByText("招待リンクを作成しました")).toBeVisible();

    // 招待リンクが表示される
    await expect(page.getByText("以下のリンクを招待したい相手に共有してください")).toBeVisible();
    await expect(page.getByText(/\/invite\?token=/)).toBeVisible();
  });

  test("招待リンクを作成してtmpに保存（サブユーザーテスト用）", async ({ page }) => {
    await openManagerInviteModal(page);

    // 名前を入力
    const managerName = `E2E招待テスト_${Date.now()}`;
    await page.getByLabel("名前").fill(managerName);

    // 招待リンクを作成
    await page.getByRole("button", { name: "招待リンクを作成" }).click();

    // 成功トースト確認
    await expect(page.getByText("招待リンクを作成しました")).toBeVisible();

    // 招待URLを取得してtmpファイルに保存
    const inviteUrlElement = page.getByText(/\/invite\?token=/);
    await expect(inviteUrlElement).toBeVisible();
    const inviteUrl = await inviteUrlElement.textContent();

    if (inviteUrl) {
      // tmpディレクトリが存在しない場合は作成
      const tmpDir = path.dirname(E2ETmpInviteUrl);
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      fs.writeFileSync(E2ETmpInviteUrl, inviteUrl);
    }

    expect(inviteUrl).toContain("/invite?token=");
  });

  test("必須項目が未入力だとエラーになること", async ({ page }) => {
    await openManagerInviteModal(page);

    // 何も入力せずに招待リンク作成ボタンクリック
    await page.getByRole("button", { name: "招待リンクを作成" }).click();

    // エラーメッセージ確認
    await expect(page.getByText("必須項目です")).toBeVisible();
  });
});

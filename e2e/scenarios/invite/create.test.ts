import { expect, test } from "@playwright/test";
import { goToFirstShop, goToStaffTab, openManagerInviteModal } from "@/e2e/helpers/navigation";

test.describe("マネージャー招待作成", () => {
  test.beforeEach(async ({ page }) => {
    await goToFirstShop(page);
    await goToStaffTab(page);
  });

  test("モーダルが開閉できること", async ({ page }) => {
    await openManagerInviteModal(page);

    // キャンセルでモーダル閉じる
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("招待リンクを作成できること", async ({ page }) => {
    await openManagerInviteModal(page);

    // 名前とメールアドレスを入力
    const managerName = `招待テスト_${Date.now()}`;
    await page.getByLabel("名前").fill(managerName);
    await page.getByLabel("メールアドレス").fill(`create-test-${Date.now()}@example.com`);

    // 招待する
    await page.getByRole("button", { name: "招待する" }).click();

    // 成功トースト確認
    await expect(page.getByText("招待リンクを作成しました")).toBeVisible();

    // モーダルが閉じる
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("必須項目が未入力だとエラーになること", async ({ page }) => {
    await openManagerInviteModal(page);

    // 何も入力せずに招待ボタンクリック
    await page.getByRole("button", { name: "招待する" }).click();

    // エラーメッセージ確認
    await expect(page.getByText("必須項目です")).toHaveCount(2);
  });

  test("重複メールで招待するとエラーになること", async ({ page }) => {
    const duplicateEmail = `duplicate-${Date.now()}@example.com`;

    // 1回目の招待
    await openManagerInviteModal(page);
    await page.getByLabel("名前").fill("重複テスト1");
    await page.getByLabel("メールアドレス").fill(duplicateEmail);
    await page.getByRole("button", { name: "招待する" }).click();
    await expect(page.getByText("招待リンクを作成しました")).toBeVisible();

    // 2回目の招待（同じメール）
    await openManagerInviteModal(page);
    await page.getByLabel("名前").fill("重複テスト2");
    await page.getByLabel("メールアドレス").fill(duplicateEmail);
    await page.getByRole("button", { name: "招待する" }).click();

    // エラーメッセージ確認
    await expect(page.getByText("このメールアドレスは既に招待中です")).toBeVisible();

    // モーダルを閉じる
    await page.getByRole("button", { name: "キャンセル" }).click();
  });
});

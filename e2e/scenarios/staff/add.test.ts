import { expect, test } from "@playwright/test";
import { goToStaffList, openStaffAddModal } from "@/e2e/helpers/navigation";

test.describe("スタッフ追加", () => {
  test.beforeEach(async ({ page }) => {
    await goToStaffList(page);
  });

  test("モーダルが開閉できること", async ({ page }) => {
    // 追加ボタンクリック → モーダル表示
    await openStaffAddModal(page);

    // キャンセルでモーダル閉じる
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("スタッフを追加できること", async ({ page }) => {
    await openStaffAddModal(page);

    // フォーム入力（ユニークなメールアドレス）
    const uniqueEmail = `test-${Date.now()}@example.com`;
    await page.getByLabel("名前").fill("テスト太郎");
    await page.getByLabel("メールアドレス").fill(uniqueEmail);

    // 追加実行
    await page.getByRole("button", { name: "追加" }).click();

    // 成功トースト確認
    await expect(page.getByText("テスト太郎 を追加しました")).toBeVisible();

    // モーダルが閉じる
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("必須項目が未入力だとエラーになること", async ({ page }) => {
    await openStaffAddModal(page);

    // 何も入力せずに追加ボタンクリック
    await page.getByRole("button", { name: "追加" }).click();

    // エラーメッセージ確認（複数表示される可能性があるので first()）
    await expect(page.getByText("必須項目です").first()).toBeVisible();
  });
});

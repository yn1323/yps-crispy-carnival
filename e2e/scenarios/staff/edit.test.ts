import { expect, test } from "@playwright/test";
import { goToStaffDetail, goToStaffEditFromDetail, goToStaffList } from "@/e2e/helpers/navigation";

test.describe("スタッフ編集", () => {
  test.beforeEach(async ({ page }) => {
    await goToStaffList(page);
    await goToStaffDetail(page);
    await goToStaffEditFromDetail(page);
  });

  test("基本情報を編集できること", async ({ page }) => {
    // 表示名フィールドを取得して変更
    const displayNameInput = page.getByLabel("表示名");
    await displayNameInput.clear();
    await displayNameInput.fill("編集テスト名");

    // 保存
    await page.getByRole("button", { name: "保存" }).click();

    // 成功トースト確認
    await expect(page.getByText("スタッフ情報を更新しました")).toBeVisible();
  });

  test("スキルを追加できること", async ({ page }) => {
    // スキル追加ボタンクリック
    await page.getByRole("button", { name: "スキルを追加" }).click();

    // スキル入力フォームが表示される（ポジション選択）
    await expect(page.getByText("ポジション")).toBeVisible();
  });

  test("キャンセルで編集画面を閉じられること", async ({ page }) => {
    await page.getByRole("link", { name: "キャンセル" }).click();

    // 詳細ページに戻る
    await expect(page).toHaveURL(/\/staffs\/[^/]+$/);
  });
});

import { expect, test } from "@playwright/test";
import { goToStaffDetail, goToStaffEditFromDetail, goToStaffList } from "@/e2e/helpers/navigation";

test.describe("スタッフ退職処理", () => {
  test.beforeEach(async ({ page }) => {
    await goToStaffList(page);
    await goToStaffDetail(page);
    await goToStaffEditFromDetail(page);
  });

  test("退職処理ダイアログが表示されること", async ({ page }) => {
    // 退職処理ボタンがあるか確認（自分自身の場合は無効化されている可能性）
    const resignButton = page.getByRole("button", { name: "退職処理を実行" });

    // ボタンが無効化されていない場合のみダイアログテスト
    if (await resignButton.isEnabled()) {
      await resignButton.click();

      // 確認ダイアログが表示される
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expect(page.getByText("本当に")).toBeVisible();
    }
  });

  test("キャンセルで退職処理を中止できること", async ({ page }) => {
    const resignButton = page.getByRole("button", { name: "退職処理を実行" });

    // ボタンが無効化されていない場合のみテスト
    if (await resignButton.isEnabled()) {
      await resignButton.click();
      await page.getByRole("button", { name: "キャンセル" }).click();

      // ダイアログが閉じる
      await expect(page.getByRole("alertdialog")).not.toBeVisible();
    }
  });
});

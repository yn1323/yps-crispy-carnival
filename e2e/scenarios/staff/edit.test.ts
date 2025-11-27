import { expect, test } from "@playwright/test";
import { getStaffLinks, goToFirstShop, goToStaffTab, waitForStaffList } from "@/e2e/helpers/navigation";

test.describe("スタッフ情報編集", () => {
  test("スタッフの管理情報を編集して保存できること", async ({ page }) => {
    await goToFirstShop(page);
    await goToStaffTab(page);
    await waitForStaffList(page);

    const staffLinks = getStaffLinks(page);
    const staffCount = await staffLinks.count();

    if (staffCount === 0) {
      test.skip();
      return;
    }

    // 最初のスタッフをクリック
    await staffLinks.first().click();
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

    // 編集ボタンをクリック
    await page.getByRole("button", { name: /編集|変更/ }).click();
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+\/edit$/);

    // テスト用のユニークな値を生成
    const timestamp = Date.now();
    const testMemo = `テストメモ ${timestamp}`;
    const testWorkStyleNote = `週3日希望 ${timestamp}`;
    const testMaxHours = "120";
    const testHourlyWage = "1500";

    // 最大勤務時間を入力
    const maxHoursInput = page.locator('input[placeholder="160"]');
    await maxHoursInput.scrollIntoViewIfNeeded();
    await maxHoursInput.clear();
    await maxHoursInput.fill(testMaxHours);

    // 時給を入力
    const hourlyWageInput = page.locator('input[placeholder="1200"]');
    await hourlyWageInput.scrollIntoViewIfNeeded();
    await hourlyWageInput.clear();
    await hourlyWageInput.fill(testHourlyWage);

    // スタッフメモを入力
    const memoTextarea = page.locator('textarea[placeholder="例：スキル、注意事項など"]');
    await memoTextarea.scrollIntoViewIfNeeded();
    await memoTextarea.clear();
    await memoTextarea.fill(testMemo);

    // 働き方メモを入力
    const workStyleTextarea = page.locator(
      'textarea[placeholder="例：月曜は大学があるので18時以降のみ、週3日希望、土日どちらかは出勤したい"]',
    );
    await workStyleTextarea.scrollIntoViewIfNeeded();
    await workStyleTextarea.clear();
    await workStyleTextarea.fill(testWorkStyleNote);

    // 保存ボタンをクリック
    const saveButton = page.getByRole("button", { name: "変更を保存" });
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.click();

    // 成功トーストが表示されることを確認
    await expect(page.getByText("スタッフ情報を更新しました")).toBeVisible();

    // スタッフ詳細ページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);

    // 再度編集ページを開いて、値が保存されていることを確認
    await page.getByRole("button", { name: /編集|変更/ }).click();
    await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+\/edit$/);

    // 保存した値が表示されていることを確認
    await expect(maxHoursInput).toHaveValue(testMaxHours);
    await expect(hourlyWageInput).toHaveValue(testHourlyWage);
    await expect(memoTextarea).toHaveValue(testMemo);
    await expect(workStyleTextarea).toHaveValue(testWorkStyleNote);
  });
});

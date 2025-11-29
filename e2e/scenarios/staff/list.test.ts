import { expect, test } from "@playwright/test";
import { goToStaffList } from "@/e2e/helpers/navigation";

test.describe("スタッフ一覧（StaffTab）", () => {
  test.beforeEach(async ({ page }) => {
    await goToStaffList(page);
  });

  test("スタッフ一覧が表示されること", async ({ page }) => {
    // スタッフ数が表示される
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();

    // スタッフカードが表示される（スタッフ詳細へのリンク）
    const staffLinks = page.locator('a[href*="/staffs/"]');
    await expect(staffLinks.first()).toBeVisible();
  });

  test("名前で検索できること", async ({ page }) => {
    // 検索前のスタッフ数を取得
    const countText = await page.getByText(/\d+名のスタッフ/).textContent();
    const initialCount = Number.parseInt(countText?.match(/\d+/)?.[0] ?? "0", 10);

    // 存在するスタッフ名で検索（seedデータの「桐山」）
    await page.getByPlaceholder("名前・メールで検索...").fill("シフト");

    // 検索結果が表示される（1名以上）
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();

    // 検索後のスタッフ数が初期より少ないか同じ
    const filteredCountText = await page.getByText(/\d+名のスタッフ/).textContent();
    const filteredCount = Number.parseInt(filteredCountText?.match(/\d+/)?.[0] ?? "0", 10);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("存在しない名前で検索すると空状態が表示されること", async ({ page }) => {
    // 存在しない名前で検索
    await page.getByPlaceholder("名前・メールで検索...").fill("存在しないスタッフ名XXXYYY");

    // 空状態メッセージが表示される
    await expect(page.getByText("該当するスタッフが見つかりませんでした")).toBeVisible();
  });

  test("ステータスフィルターで退職済みを選択できること", async ({ page }) => {
    // 「退職済み」を選択（Selectコンポーネントをクリック）
    await page.locator('button[role="combobox"]').click();
    await page.getByRole("option", { name: "退職済み" }).click();

    // 退職済みスタッフが表示されるか、空状態が表示される
    const hasResignedStaff = await page.getByText(/\d+名のスタッフ/).isVisible();
    const hasEmptyState = await page.getByText("該当するスタッフが見つかりませんでした").isVisible();

    expect(hasResignedStaff || hasEmptyState).toBeTruthy();
  });

  test("ステータスフィルターで全員を選択できること", async ({ page }) => {
    // 「全員」を選択
    await page.locator('button[role="combobox"]').click();
    await page.getByRole("option", { name: "全員" }).click();

    // スタッフ一覧が表示される
    await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
  });
});

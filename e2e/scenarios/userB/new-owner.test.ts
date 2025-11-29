import { expect, test } from "@playwright/test";

test.describe("新規店長の初回ログイン", () => {
  test("新規ユーザーが初回ログインすると店舗がない状態が表示されること", async ({ page }) => {
    // 店舗一覧ページにアクセス
    await page.goto("/shops");

    // 「所属する店舗がありません」が表示される
    await expect(page.getByText("所属する店舗がありません")).toBeVisible();

    // 「店舗を登録する」ボタンが表示される
    await expect(page.getByRole("link", { name: "店舗を登録する" })).toBeVisible();
  });

  test("新規店長が店舗を登録できること", async ({ page }) => {
    // 店舗一覧ページにアクセス
    await page.goto("/shops");

    // 「店舗を登録する」ボタンをクリック
    await page.getByRole("link", { name: "店舗を登録する" }).click();

    // 店舗登録ページに遷移
    await expect(page).toHaveURL("/shops/new");

    // 店舗情報を入力
    const shopName = `新規店長の店舗_${Date.now()}`;
    await page.getByLabel("店舗名").fill(shopName);

    // 登録ボタンをクリック
    await page.getByRole("button", { name: "登録" }).click();

    // トースト確認
    await expect(page.getByText("店舗登録が完了しました")).toBeVisible();

    // 店舗一覧に遷移
    await expect(page).toHaveURL("/shops");

    // 登録した店舗が一覧に表示される
    await expect(page.getByText(shopName)).toBeVisible();
  });
});

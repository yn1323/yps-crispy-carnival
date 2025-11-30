import { expect, type Page } from "@playwright/test";

/**
 * 店舗一覧から最初の店舗詳細ページへ移動
 */
export const goToFirstShop = async (page: Page) => {
  await page.goto("/shops");
  // 店舗カード（group）を含むリンクをクリック
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("group") })
    .first()
    .click();
  await expect(page).toHaveURL(/\/shops\/[^/]+$/);
};

/**
 * スタッフタブをクリックしてスタッフ一覧を表示
 */
export const goToStaffTab = async (page: Page) => {
  await page.getByRole("tab", { name: "スタッフ" }).click();
};

/**
 * スタッフ一覧が表示されるまで待機
 */
export const waitForStaffList = async (page: Page) => {
  await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
};

/**
 * 店舗一覧 → 店舗詳細 → スタッフタブ → スタッフ一覧表示まで一括で実行
 */
export const goToStaffList = async (page: Page) => {
  await goToFirstShop(page);
  await goToStaffTab(page);
  await waitForStaffList(page);
};

/**
 * メンバー追加モーダルを開く
 */
export const openMemberAddModal = async (page: Page) => {
  await page.getByRole("button", { name: "メンバーを追加" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

/**
 * スタッフ追加モーダルを開く（スタッフを選択した状態）
 */
export const openStaffAddModal = async (page: Page) => {
  await openMemberAddModal(page);
  // デフォルトでスタッフが選択されているので、そのまま
};

/**
 * スタッフ詳細ページへ移動（スタッフ一覧から）
 */
export const goToStaffDetail = async (page: Page) => {
  // スタッフカードのリンクをクリック（URL構造で判定）
  await page.locator('a[href*="/staffs/"]').first().click();
  // URL: /shops/{shopId}/staffs/{staffId}
  await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs\/[^/]+$/);
};

/**
 * スタッフ編集ページへ移動（スタッフ詳細から）
 */
export const goToStaffEditFromDetail = async (page: Page) => {
  await page.getByRole("button", { name: "編集" }).click();
  // 編集ページのロード完了を待つ
  await expect(page.getByLabel("表示名")).toBeVisible();
};

/**
 * マネージャー招待モーダルを開く（マネージャーを選択した状態）
 */
export const openManagerInviteModal = async (page: Page) => {
  await openMemberAddModal(page);
  // マネージャーのラジオカードを選択
  await page
    .locator("div")
    .filter({ hasText: /^マネージャーログインして店舗運営に参加シフト作成・スタッフ管理ができます$/ })
    .first()
    .click();
};

/**
 * 招待中タブをクリックして招待一覧を表示
 */
export const goToInviteTab = async (page: Page) => {
  await page.getByRole("tab", { name: "招待中" }).click();
};

/**
 * 招待一覧が表示されるまで待機
 */
export const waitForInviteList = async (page: Page) => {
  await expect(page.getByText(/\d+件の招待/)).toBeVisible();
};

/**
 * 店舗一覧 → 店舗詳細 → 招待中タブ → 招待一覧表示まで一括で実行
 */
export const goToInviteList = async (page: Page) => {
  await goToFirstShop(page);
  await goToInviteTab(page);
  await waitForInviteList(page);
};

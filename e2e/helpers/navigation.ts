import { expect, type Page } from "@playwright/test";

/**
 * 店舗一覧から最初の店舗詳細ページへ移動（直接URLで遷移）
 * 注意: 店舗カードをクリックすると /staffs に遷移するため、詳細ページにはURL直接遷移が必要
 */
export const goToFirstShopDetail = async (page: Page) => {
  await page.goto("/shops");
  const shopLink = page
    .getByRole("link")
    .filter({ has: page.getByRole("group") })
    .first();
  const href = await shopLink.getAttribute("href");
  // href は /shops/{shopId}/staffs の形式
  const shopId = href?.match(/\/shops\/([^/]+)/)?.[1];
  await page.goto(`/shops/${shopId}`);
  await expect(page).toHaveURL(/\/shops\/[^/]+$/);
};

/**
 * スタッフ一覧が表示されるまで待機
 */
export const waitForStaffList = async (page: Page) => {
  await expect(page.getByText(/\d+名のスタッフ/)).toBeVisible();
};

/**
 * 店舗一覧 → スタッフ一覧表示まで一括で実行
 * 店舗カードをクリックすると直接 /shops/{shopId}/staffs に遷移する
 */
export const goToStaffList = async (page: Page) => {
  await page.goto("/shops");
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("group") })
    .first()
    .click();
  // 店舗カードは /shops/{shopId}/staffs に遷移する
  await expect(page).toHaveURL(/\/shops\/[^/]+\/staffs$/);
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

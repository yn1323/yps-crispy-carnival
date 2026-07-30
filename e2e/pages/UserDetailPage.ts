import { expect, type Locator, type Page } from "@playwright/test";

const USER_DETAIL_DATA_TIMEOUT = 20_000;

export type UserDetailShop = Readonly<{
  id: string;
  name: string;
}>;

export class UserDetailPage {
  private parentUserDetailUrl?: Readonly<{
    pathname: string;
    search: Record<string, string>;
  }>;

  constructor(
    private page: Page,
    private personName: string,
    private contextShop?: UserDetailShop,
  ) {}

  async expectLoaded() {
    await this.page.waitForURL((url) => /^\/users\/[^/]+$/.test(url.pathname), {
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
    await expect(this.page.getByRole("heading", { name: "ユーザー詳細", exact: true })).toBeVisible({
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
    await expect(this.page.getByText(this.personName, { exact: true }).first()).toBeVisible({
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
  }

  async editProfile(data: { name: string; email: string }) {
    const dialog = await this.openBasicInformation();
    const nameInput = dialog.getByLabel("名前", { exact: true });
    const emailInput = dialog.getByLabel("メールアドレス", { exact: true });

    await nameInput.clear();
    await nameInput.fill(data.name);
    await emailInput.clear();
    await emailInput.fill(data.email);
    await dialog.getByRole("button", { name: "変更を保存" }).click();
    await this.expectToastVisibleThenHidden("ユーザー情報を更新しました", dialog);
    await this.closeDialog(dialog);
    this.personName = data.name;
  }

  async expectRole(role: "管理者" | "スタッフ", options: { hasPendingManagerInvitation?: boolean } = {}) {
    if (role === "管理者") {
      await expect(this.page.getByText("管理者", { exact: true }).first()).toBeVisible();
      return;
    }

    await expect(this.page.getByText("管理者", { exact: true })).toHaveCount(0);
    await expect(this.page.getByText("閲覧のみの管理者", { exact: true })).toHaveCount(0);
    const pendingInvitationBadge = this.page.getByText("管理者招待中", { exact: true });
    if (options.hasPendingManagerInvitation) {
      await expect(pendingInvitationBadge).toBeVisible();
    } else {
      await expect(pendingInvitationBadge).toHaveCount(0);
    }
    await expect(this.page.getByRole("button", { name: /の詳細を開く$/ }).first()).toBeVisible();
  }

  async removeManagerRole() {
    const dialog = await this.openBasicInformation();
    await dialog.getByRole("button", { name: "管理者権限を外す" }).click();
    const confirmation = dialog.getByRole("alertdialog", {
      name: `${this.personName}さんの管理者権限を外しますか？`,
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText(/スタッフとしての店舗所属は維持します/)).toBeVisible();
    await confirmation.getByRole("button", { name: "管理者権限を外す" }).click();
    await this.expectToastVisibleThenHidden("管理者権限を外しました", dialog);
    await expect(confirmation).not.toBeVisible();
    await this.closeDialog(dialog);
  }

  async removeFromOrganization(
    options: { expectedAssignmentCount?: number; returnTo?: "dashboard" | "settings" } = {},
  ) {
    await this.page.getByRole("button", { name: "削除", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "ユーザーを削除", exact: true });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByText(`${this.personName}さんをこのグループから削除しますか？`, { exact: true }),
    ).toBeVisible();
    await expect(
      confirmation.getByText(`${this.personName}さんは、店舗への所属と権限（管理・スタッフ・閲覧）を失います。`, {
        exact: true,
      }),
    ).toBeVisible();
    if (options.expectedAssignmentCount !== undefined) {
      await expect(
        confirmation.getByText(`今日以降のシフト${options.expectedAssignmentCount}件からも外れます。`, {
          exact: true,
        }),
      ).toBeVisible();
    }
    await confirmation.getByRole("button", { name: "グループから削除", exact: true }).click();
    await this.expectToastVisibleThenHidden("ユーザーをグループから削除しました");
    const destination = options.returnTo === "dashboard" ? /\/dashboard(?:\?|$)/ : /\/settings(?:\?|$)/;
    await expect(this.page).toHaveURL(destination, { timeout: USER_DETAIL_DATA_TIMEOUT });
  }

  async expectAssignedShop(shop: UserDetailShop) {
    const button = this.assignedShopButton(shop);
    await expect(button).toBeVisible({ timeout: USER_DETAIL_DATA_TIMEOUT });
    await expect(button).toHaveAccessibleName(`${shop.name}の詳細を開く`);
  }

  async expectShopNotAssigned(shop: UserDetailShop) {
    await expect(this.assignedShopButton(shop)).toHaveCount(0);
  }

  async addShop(shop: UserDetailShop) {
    await this.page.getByRole("button", { name: "店舗を追加" }).click();
    const dialog = this.page.getByRole("dialog", { name: "店舗を追加" });
    await expect(dialog).toBeVisible();
    const candidate = dialog.locator(`[id="user-shop-candidate-${shop.id}"]`);
    await expect(candidate).toHaveAccessibleName(`${shop.name}に追加`);
    await candidate.click();
    await this.expectToastVisibleThenHidden("店舗にユーザーを追加しました");
    await expect(dialog).not.toBeVisible();
    await this.expectAssignedShop(shop);
  }

  async expectShopPageStructure(shop = this.requireContextShop(), sourceShop = this.requireContextShop()) {
    await this.openShopPage(shop);
    await this.expectSourceShopPreserved(sourceShop);
    await expect(this.page.getByRole("dialog", { name: shop.name })).toHaveCount(0);
    await expect(this.page.getByRole("tab")).toHaveCount(0);
    await expect(this.page.getByRole("heading", { name: "LINE連携", exact: true })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "通知", exact: true })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "店舗設定", exact: true })).toHaveCount(0);
    await expect(this.page.getByRole("checkbox", { name: /シフト対象/ })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "店舗から外す" })).toBeVisible();
    await this.returnToUserDetail(shop);
  }

  async removeFromShop(shop = this.requireContextShop()) {
    await this.openShopPage(shop);
    await this.page.getByRole("button", { name: "店舗から外す" }).click();
    const confirmation = this.page.getByRole("alertdialog", {
      name: "店舗から外す",
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText(`${this.personName}さんを${shop.name}から外しますか？`)).toBeVisible();
    await confirmation.getByRole("button", { name: "店舗から外す" }).click();
    await this.expectToastVisibleThenHidden("この店舗のスタッフ所属を削除しました");
    await this.expectParentUserDetailRestored();
    await this.expectShopNotAssigned(shop);
  }

  async setShiftTarget(isShiftTarget: boolean, shop = this.requireContextShop()) {
    await this.openShopPage(shop);
    const shiftTargetSwitch = this.page.getByRole("checkbox", { name: /シフト対象/ });
    await expect(shiftTargetSwitch).toBeVisible();
    if ((await shiftTargetSwitch.isChecked()) !== isShiftTarget) {
      await shiftTargetSwitch.press("Space");
      await this.expectToastVisibleThenHidden(isShiftTarget ? "シフト対象に戻しました" : "シフト対象外にしました");
      await expect(shiftTargetSwitch).toBeChecked({ checked: isShiftTarget });
    }
    await this.returnToUserDetail(shop);
  }

  async sendOpenRecruitmentNotification(shop = this.requireContextShop()) {
    await this.openShopPage(shop);
    await this.page.getByRole("button", { name: "募集中のシフトを送る" }).click();
    await this.expectToastVisibleThenHidden("シフト募集通知を送りました");
    await this.returnToUserDetail(shop);
  }

  async sendCurrentShiftNotification(shop = this.requireContextShop()) {
    await this.openShopPage(shop);
    await this.page.getByRole("button", { name: "確定シフトを送る" }).click();
    await this.expectToastVisibleThenHidden("現在の確定シフトを送りました");
    await this.returnToUserDetail(shop);
  }

  async sendLineInvite(shop = this.requireContextShop()) {
    await this.openShopPage(shop);
    await this.page.getByRole("button", { name: "メールでLINE連携リンクを送る" }).click();
    await this.expectToastVisibleThenHidden(
      /LINE連携URLをメールで送信しました|LINE連携リンクをメールで送信しました|LINE連携リンクをメールで送りました/,
    );
    await this.returnToUserDetail(shop);
  }

  async openLineQr(shop = this.requireContextShop()) {
    await this.openShopPage(shop);
    await this.page.getByRole("button", { name: "LINE連携リンクを表示" }).click();
    await expect(this.page.getByRole("img", { name: "LINE連携用QRコード" })).toBeVisible({
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
    await expect(this.page.getByTitle(/^https:\/\//)).toBeVisible();
    await expect(this.page.getByRole("button", { name: "リンクをコピー" })).toBeVisible();
  }

  async returnToDashboard() {
    await this.expectLoaded();
    await this.page.getByRole("button", { name: "ユーザー詳細", exact: true }).click();
    await expect(this.page).toHaveURL(/\/dashboard\?/, { timeout: USER_DETAIL_DATA_TIMEOUT });
  }

  async returnToSettings() {
    await this.expectLoaded();
    await this.page.getByRole("button", { name: "ユーザー詳細", exact: true }).click();
    await expect(this.page).toHaveURL(/\/settings\?/, { timeout: USER_DETAIL_DATA_TIMEOUT });
  }

  private async openBasicInformation() {
    await this.page.getByRole("button", { name: "基本情報を開く" }).click();
    const dialog = this.page.getByRole("dialog", { name: "基本情報" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tab")).toHaveCount(0);
    return dialog;
  }

  private async openShopPage(shop: UserDetailShop) {
    const parentUrl = new URL(this.page.url());
    if (!/^\/users\/[^/]+$/.test(parentUrl.pathname)) {
      throw new Error(`店舗別設定の遷移元がユーザー詳細ではありません: ${parentUrl.pathname}`);
    }
    this.parentUserDetailUrl = {
      pathname: parentUrl.pathname,
      search: Object.fromEntries(parentUrl.searchParams.entries()),
    };

    await this.assignedShopButton(shop).click();
    const expectedPathname = `${parentUrl.pathname}/shops/${shop.id}`;
    await this.page.waitForURL((url) => url.pathname === expectedPathname, {
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
    await expect(this.shopPageHeading(shop)).toBeVisible({ timeout: USER_DETAIL_DATA_TIMEOUT });
  }

  private async expectSourceShopPreserved(sourceShop: UserDetailShop) {
    const url = new URL(this.page.url());
    expect(url.searchParams.get("shop")).toBe(sourceShop.id);
    expect(url.searchParams.get("panel")).toBeNull();
  }

  private async returnToUserDetail(shop: UserDetailShop) {
    await this.shopPageHeading(shop)
      .getByRole("button", { name: `${shop.name}：${this.personName}`, exact: true })
      .click();
    await this.expectParentUserDetailRestored();
  }

  private async expectParentUserDetailRestored() {
    const expectedUrl = this.parentUserDetailUrl;
    if (!expectedUrl) throw new Error("店舗別設定の遷移元URLを取得できませんでした");

    await this.page.waitForURL((url) => url.pathname === expectedUrl.pathname, {
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
    const actualUrl = new URL(this.page.url());
    expect(Object.fromEntries(actualUrl.searchParams.entries())).toEqual(expectedUrl.search);
    this.parentUserDetailUrl = undefined;
    await this.expectLoaded();
  }

  private shopPageHeading(shop: UserDetailShop) {
    return this.page.getByRole("heading", {
      level: 1,
      name: `${shop.name}：${this.personName}`,
      exact: true,
    });
  }

  private assignedShopButton(shop: UserDetailShop) {
    return this.page.locator(`[id="user-shop-${shop.id}"]`);
  }

  private async closeDialog(dialog: Locator) {
    await dialog.getByRole("button", { name: "閉じる" }).first().click();
    await expect(dialog).not.toBeVisible();
  }

  private requireContextShop() {
    if (!this.contextShop) throw new Error("ユーザー詳細を開いた店舗を取得できませんでした");
    return this.contextShop;
  }

  private async expectToastVisibleThenHidden(title: string | RegExp, dialogToRemainOpen?: Locator) {
    const toast = this.page.locator("[data-scope='toast'][data-part='root']").filter({ hasText: title }).first();
    await expect(toast).toBeVisible();
    await toast.getByLabel("通知を閉じる").click();
    const openToast = this.page
      .locator("[data-scope='toast'][data-part='root'][data-state='open']")
      .filter({ hasText: title });
    await expect(openToast).toHaveCount(0);
    if (dialogToRemainOpen) await expect(dialogToRemainOpen).toBeVisible();
  }
}

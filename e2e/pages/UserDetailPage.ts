import { expect, type Locator, type Page } from "@playwright/test";

const USER_DETAIL_DATA_TIMEOUT = 20_000;

export type UserDetailShop = Readonly<{
  id: string;
  name: string;
}>;

export class UserDetailPage {
  constructor(
    private page: Page,
    private personName: string,
    private contextShop?: UserDetailShop,
  ) {}

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/users\/[^/?]+/, { timeout: USER_DETAIL_DATA_TIMEOUT });
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

  async removeFromOrganization(options: { expectedAssignmentCount?: number } = {}) {
    await this.page.getByRole("button", { name: "削除", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", {
      name: `${this.personName}さんをグループから削除しますか？`,
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText(/ほかのグループへの所属には影響しません/)).toBeVisible();
    if (options.expectedAssignmentCount !== undefined) {
      await expect(
        confirmation.getByText(`今日以降のシフト${options.expectedAssignmentCount}件からも外れます。`, {
          exact: true,
        }),
      ).toBeVisible();
    }
    await confirmation.getByRole("button", { name: "グループから削除" }).click();
    await this.expectToastVisibleThenHidden("ユーザーをグループから削除しました");
    await expect(this.page).toHaveURL(/\/settings\?/, { timeout: USER_DETAIL_DATA_TIMEOUT });
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

  async expectShopDialogStructure(shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    await expect(dialog.getByRole("tab")).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "LINE連携", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "通知", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 3 }).first()).toHaveText("LINE連携");
    await expect(dialog.getByRole("heading", { name: "店舗設定", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("checkbox", { name: "シフト対象" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "店舗から外す" })).toBeVisible();
    await this.closeDialog(dialog);
  }

  async removeFromShop(shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    await dialog.getByRole("button", { name: "店舗から外す" }).click();
    const confirmation = dialog.getByRole("alertdialog", {
      name: `${this.personName}さんを${shop.name}から外しますか？`,
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "店舗から外す" }).click();
    await this.expectToastVisibleThenHidden("この店舗のスタッフ所属を削除しました");
    await expect(dialog).not.toBeVisible();
    await this.expectShopNotAssigned(shop);
  }

  async setShiftTarget(isShiftTarget: boolean, shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    const shiftTargetSwitch = dialog.getByRole("checkbox", { name: "シフト対象" });
    await expect(shiftTargetSwitch).toBeVisible();
    if ((await shiftTargetSwitch.isChecked()) !== isShiftTarget) {
      await shiftTargetSwitch.press("Space");
      await this.expectToastVisibleThenHidden(
        isShiftTarget ? "シフト対象に戻しました" : "シフト対象外にしました",
        dialog,
      );
      await expect(shiftTargetSwitch).toBeChecked({ checked: isShiftTarget });
    }
    await this.closeDialog(dialog);
  }

  async sendOpenRecruitmentNotification(shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    await dialog.getByRole("button", { name: "募集中のシフトを送る" }).click();
    await this.expectToastVisibleThenHidden("シフト募集通知を送りました", dialog);
    await this.closeDialog(dialog);
  }

  async sendCurrentShiftNotification(shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    await dialog.getByRole("button", { name: "確定シフトを送る" }).click();
    await this.expectToastVisibleThenHidden("現在の確定シフトを送りました", dialog);
    await this.closeDialog(dialog);
  }

  async sendLineInvite(shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    await dialog.getByRole("button", { name: "メールでLINE連携リンクを送る" }).click();
    await this.expectToastVisibleThenHidden(
      /LINE連携URLをメールで送信しました|LINE連携リンクをメールで送信しました|LINE連携リンクをメールで送りました/,
      dialog,
    );
    await this.closeDialog(dialog);
  }

  async openLineQr(shop = this.requireContextShop()) {
    const dialog = await this.openShopDialog(shop);
    await dialog.getByRole("button", { name: "LINE連携リンクを表示" }).click();
    await expect(dialog.getByRole("img", { name: "LINE連携用QRコード" })).toBeVisible({
      timeout: USER_DETAIL_DATA_TIMEOUT,
    });
    await expect(dialog.getByTitle(/^https:\/\//)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "リンクをコピー" })).toBeVisible();
  }

  async returnToDashboard() {
    await this.page.getByRole("button", { name: "前の画面に戻る" }).click();
    await expect(this.page).toHaveURL(/\/dashboard\?/, { timeout: USER_DETAIL_DATA_TIMEOUT });
  }

  async returnToSettings() {
    await this.page.getByRole("button", { name: "前の画面に戻る" }).click();
    await expect(this.page).toHaveURL(/\/settings\?/, { timeout: USER_DETAIL_DATA_TIMEOUT });
  }

  private async openBasicInformation() {
    await this.page.getByRole("button", { name: "基本情報を開く" }).click();
    const dialog = this.page.getByRole("dialog", { name: "基本情報" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("tab")).toHaveCount(0);
    return dialog;
  }

  private async openShopDialog(shop: UserDetailShop) {
    await this.assignedShopButton(shop).click();
    const dialog = this.page.getByRole("dialog", { name: shop.name });
    await expect(dialog).toBeVisible({ timeout: USER_DETAIL_DATA_TIMEOUT });
    return dialog;
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

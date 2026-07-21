import { expect, type Locator, type Page } from "@playwright/test";
import { UserDetailPage } from "./UserDetailPage";

const SETTINGS_DATA_TIMEOUT = 20_000;
const SUBSCRIPTION_DELETION_DISABLED_REASON =
  "サブスクリプションが存在します。支払いを取り返してから削除してください。";

export class OrganizationSettingsPage {
  constructor(private page: Page) {}

  async goto(shopId: string, tab: "people" | "shops" | "billing" | "settings" = "people") {
    await this.page.goto(
      `/settings?shop=${encodeURIComponent(shopId)}${tab === "people" ? "" : `&tab=${encodeURIComponent(tab)}`}`,
    );
  }

  async expectOrganization(name: string) {
    await expect(this.page.getByRole("heading", { name, exact: true })).toBeVisible({
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async switchOrganization(organizationName: string, expectedShopId: string) {
    const selector = this.page.getByRole("button", { name: /グループを切り替える。現在は/ });
    await expect(selector).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
    await selector.click();
    await this.page.getByRole("menuitem", { name: organizationName, exact: true }).click();
    await expect(this.page).toHaveURL(
      new RegExp(`/settings\\?(?:[^#]*&)?shop=${escapeRegExp(encodeURIComponent(expectedShopId))}(?:&|$)`),
      { timeout: SETTINGS_DATA_TIMEOUT },
    );
    await this.expectOrganization(organizationName);
  }

  async openPeopleTab() {
    await this.page.getByRole("tab", { name: "ユーザー" }).click();
  }

  async openShopsTab() {
    await this.page.getByRole("tab", { name: "店舗" }).click();
  }

  async openSettingsTab() {
    await this.page.getByRole("tab", { name: "設定" }).click();
  }

  async expectBillingTabSelected(shopId: string) {
    await expect
      .poll(
        () => {
          const url = new URL(this.page.url());
          return {
            pathname: url.pathname,
            shop: url.searchParams.get("shop"),
            tab: url.searchParams.get("tab"),
          };
        },
        { timeout: SETTINGS_DATA_TIMEOUT },
      )
      .toEqual({ pathname: "/settings", shop: shopId, tab: "billing" });
    await expect(this.page.getByRole("tab", { name: "プランと支払い" })).toHaveAttribute("aria-selected", "true", {
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async expectOrganizationDeletionBlockedBySubscription() {
    await this.openSettingsTab();
    const deleteButton = this.page.getByRole("button", { name: "削除", exact: true });
    await expect(deleteButton).toBeDisabled({ timeout: SETTINGS_DATA_TIMEOUT });
    await expect(this.page.getByText(SUBSCRIPTION_DELETION_DISABLED_REASON, { exact: true })).toBeVisible();

    // native click()でもdisabled buttonはclick eventを発火せず、確認Dialogを開かない。
    await deleteButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(this.page.getByRole("alertdialog", { name: "グループを削除" })).toHaveCount(0);
  }

  async inviteExistingStaffAsManager(personName: string) {
    await this.openPeopleTab();
    await this.page.getByRole("button", { name: "管理者を招待" }).click();
    const dialog = this.page.getByRole("dialog", { name: "新しい管理者を招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: `${personName}を選択` }).click();
    await dialog.getByRole("button", { name: "管理者招待を送る" }).click();
    await this.expectToast("ログイン案内を送りました");
    await expect(dialog).not.toBeVisible();
  }

  async openFreeManagerExchangeConfirmation(personName: string) {
    await this.openPeopleTab();
    await this.page.getByRole("button", { name: "次の管理者を招待" }).click();
    const dialog = this.freeManagerExchangeDialog();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: `${personName}を選択` }).click();
    await dialog.getByRole("button", { name: "交代内容を確認" }).click();

    await expect(
      dialog.getByRole("heading", { name: `${personName}さんへ管理者交代の案内を送りますか？` }),
    ).toBeVisible();
    await expect(
      dialog.getByText(new RegExp(`${escapeRegExp(personName)}さんがアカウントを連携すると、`)),
    ).toBeVisible();
    await expect(dialog.getByText(/このグループの唯一の管理者になります/)).toBeVisible();
    await expect(dialog.getByText(/あなたのこのグループの管理者権限は終了し/)).toBeVisible();
    await expect(dialog.getByText(/交代が完了するまでは、あなたが引き続き管理できます/)).toBeVisible();
  }

  async confirmFreeManagerExchange() {
    const dialog = this.freeManagerExchangeDialog();
    await dialog.getByRole("button", { name: "交代の案内を送る" }).click();
    await this.expectToast("ログイン案内を送りました");
    await expect(dialog).not.toBeVisible();
  }

  async inviteExternalManager(person: { name: string; email: string }) {
    await this.openPeopleTab();
    await this.page.getByRole("button", { name: "管理者を招待" }).click();
    const dialog = this.page.getByRole("dialog", { name: "新しい管理者を招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: "名前・メールを入力" }).click();
    await dialog.getByLabel("名前").fill(person.name);
    await dialog.getByLabel("メールアドレス").fill(person.email);
    await dialog.getByRole("button", { name: "管理者招待を送る" }).click();
    await this.expectToast("ログイン案内を送りました");
    await expect(dialog).not.toBeVisible();
  }

  async expectPersonVisible(personName: string) {
    await expect(this.personRow(personName)).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
  }

  async expectPersonNotVisible(personName: string) {
    await expect(this.personRow(personName)).toHaveCount(0);
  }

  async expectPersonShopNames(personName: string, shopNames: string[]) {
    await this.openPeopleTab();
    const row = this.personRow(personName);
    await expect(row).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
    await expect(row.getByText(shopNames.join("、") || "なし", { exact: true })).toBeVisible();
  }

  async expectPeopleUsage(current: number, max: number) {
    await this.page.getByRole("tab", { name: "プランと支払い" }).click();
    await expect(this.page.getByText("利用人数", { exact: true })).toBeVisible();
    await expect(this.page.getByText(`${current} / ${max}`, { exact: true })).toBeVisible();
  }

  async expectPersonRole(personName: string, role: "管理者" | "スタッフ") {
    const detail = await this.openUser(personName);
    await detail.expectRole(role);
    await detail.returnToSettings();
  }

  async removeManagerRole(personName: string) {
    const detail = await this.openUser(personName);
    await detail.removeManagerRole();
    await detail.returnToSettings();
  }

  async removePerson(personName: string) {
    const detail = await this.openUser(personName);
    await detail.removeFromOrganization();
  }

  async addShop(shopName: string) {
    await this.openShopsTab();
    await this.page.getByRole("button", { name: "店舗を追加" }).click();
    const dialog = this.page.getByRole("dialog", { name: "店舗を追加" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/店舗名|お店の名前/).fill(shopName);

    for (let step = 0; step < 3; step += 1) {
      await dialog.getByRole("button", { name: "次へ" }).click();
    }

    await expect(dialog.getByText("定休日", { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "店舗を追加" }).click();
    await this.expectToast("店舗を追加しました");
    await expect(dialog).not.toBeVisible();
  }

  async expectShopVisible(shopName: string) {
    await this.openShopsTab();
    await expect(this.shopRow(shopName)).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
  }

  async expectShopNotVisible(shopName: string) {
    await this.openShopsTab();
    await expect(this.shopRow(shopName)).toHaveCount(0);
  }

  async cancelShopDeletion(shopName: string) {
    const detail = await this.openShop(shopName);
    await detail.getByRole("button", { name: "削除", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "店舗を削除" });
    await expect(confirmation.getByText(`「${shopName}」を削除しますか？`, { exact: true })).toBeVisible();
    await confirmation.getByRole("button", { name: "キャンセル" }).click();
    await expect(confirmation).not.toBeVisible();
    await detail.getByRole("button", { name: "前の画面に戻る" }).click();
    await expect(this.page.getByRole("tab", { name: "店舗" })).toBeVisible();
  }

  async deleteShop(shopName: string) {
    const detail = await this.openShop(shopName);
    await detail.getByRole("button", { name: "削除", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "店舗を削除" });
    await expect(confirmation.getByText(`「${shopName}」を削除しますか？`, { exact: true })).toBeVisible();
    await confirmation.getByRole("button", { name: "店舗を削除" }).click();
    await this.expectToast("店舗の削除を受け付けました");
    await expect(confirmation).not.toBeVisible();
  }

  async cancelOrganizationDeletion(organizationName: string) {
    const confirmation = await this.openOrganizationDeletionConfirmation();
    await expect(confirmation.getByRole("button", { name: "このグループを削除" })).toBeDisabled();
    await this.cancelOpenOrganizationDeletion(organizationName);
  }

  async openOrganizationDeletionConfirmation() {
    await this.openSettingsTab();
    await this.page.getByRole("button", { name: "削除", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "グループを削除" });
    await expect(confirmation).toBeVisible();
    return confirmation;
  }

  async cancelOpenOrganizationDeletion(organizationName: string) {
    const confirmation = this.page.getByRole("alertdialog", { name: "グループを削除" });
    await confirmation.getByRole("button", { name: "キャンセル" }).click();
    await expect(confirmation).not.toBeVisible();
    await this.expectOrganization(organizationName);
  }

  async rejectMismatchedOrganizationDeletionName(organizationName: string, mismatchedName: string) {
    const confirmation = await this.openOrganizationDeletionConfirmation();
    const submit = confirmation.getByRole("button", { name: "このグループを削除" });
    await confirmation.getByRole("textbox").fill(mismatchedName);
    await expect(submit).toBeDisabled();
    await confirmation.getByRole("button", { name: "キャンセル" }).click();
    await expect(confirmation).not.toBeVisible();
    await this.expectOrganization(organizationName);
  }

  async deleteOrganization(organizationName: string, expectedShopId: string | null) {
    const confirmation = await this.openOrganizationDeletionConfirmation();
    const submit = confirmation.getByRole("button", { name: "このグループを削除" });
    await expect(submit).toBeDisabled();
    await confirmation.getByRole("textbox").fill(organizationName);
    await expect(submit).toBeEnabled();

    const destination = expectedShopId
      ? new RegExp(`/dashboard\\?shop=${escapeRegExp(encodeURIComponent(expectedShopId))}(?:&|$)`)
      : /\/dashboard$/;
    await Promise.all([this.page.waitForURL(destination, { timeout: SETTINGS_DATA_TIMEOUT }), submit.click()]);
  }

  async openUser(personName: string) {
    await this.openPeopleTab();
    await this.personRow(personName).click();
    const detail = new UserDetailPage(this.page, personName);
    await detail.expectLoaded();
    return detail;
  }

  private async openShop(shopName: string): Promise<Locator> {
    await this.openShopsTab();
    await this.shopRow(shopName).click();
    await expect(this.page).toHaveURL(/\/shops\/[^/?]+/);
    await expect(this.page.getByRole("heading", { name: "店舗詳細", exact: true })).toBeVisible();
    await expect(this.page.getByText(shopName, { exact: true }).first()).toBeVisible();
    return this.page.locator("body");
  }

  private freeManagerExchangeDialog() {
    return this.page.getByRole("dialog", { name: "次の管理者を招待" });
  }

  private personRow(personName: string) {
    return this.page.getByRole("button", { name: `${personName}のユーザー詳細を開く` });
  }

  private shopRow(shopName: string) {
    return this.page.getByRole("button", { name: `${shopName}の店舗詳細を開く` });
  }

  private async expectToast(title: string) {
    await expect(this.page.getByText(title, { exact: true }).first()).toBeVisible();
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

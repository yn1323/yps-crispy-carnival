import { expect, type Locator, type Page } from "@playwright/test";

const SETTINGS_DATA_TIMEOUT = 20_000;

export class OrganizationSettingsPage {
  constructor(private page: Page) {}

  async goto(shopId: string, tab: "people" | "shops" = "people") {
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

  async inviteExistingStaffAsManager(personName: string) {
    await this.openPeopleTab();
    await this.page.getByRole("button", { name: "管理者を招待" }).click();
    const dialog = this.page.getByRole("dialog", { name: "新しい管理者を招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: `${personName}を選択` }).click();
    await dialog.getByRole("button", { name: "ログイン案内を送る" }).click();
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
    await dialog.getByRole("button", { name: "ログイン案内を送る" }).click();
    await this.expectToast("ログイン案内を送りました");
    await expect(dialog).not.toBeVisible();
  }

  async expectPersonVisible(personName: string) {
    await expect(this.personRow(personName)).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
  }

  async expectPersonNotVisible(personName: string) {
    await expect(this.personRow(personName)).toHaveCount(0);
  }

  async expectPersonRole(personName: string, role: "管理者" | "スタッフ") {
    const dialog = await this.openPerson(personName);
    await expect(dialog.getByText(role, { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "閉じる" }).first().click();
    await expect(dialog).not.toBeVisible();
  }

  async removeManagerRole(personName: string) {
    const detail = await this.openPerson(personName);
    await detail.getByRole("tab", { name: "設定" }).click();
    await detail.getByRole("button", { name: "管理者権限を外す" }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "管理者権限を外す" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText(/スタッフとしての店舗所属と業務用アクセスは維持します/)).toBeVisible();
    await confirmation.getByRole("button", { name: "管理者権限を外す" }).click();
    await this.expectToast("管理者権限を外しました");
    await expect(confirmation).not.toBeVisible();
  }

  async removePerson(personName: string) {
    const detail = await this.openPerson(personName);
    await detail.getByRole("tab", { name: "設定" }).click();
    await detail.getByRole("button", { name: "グループから削除" }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "グループから利用者を削除" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText(/ほかのグループへの所属には影響しません/)).toBeVisible();
    await confirmation.getByRole("button", { name: "グループから削除" }).click();
    await this.expectToast("利用者をグループから削除しました");
    await expect(confirmation).not.toBeVisible();
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
    const dialog = await this.openShop(shopName);
    await dialog.getByRole("tab", { name: "設定" }).click();
    await dialog.getByRole("button", { name: "この店舗を削除" }).click();
    await expect(dialog.getByText(`「${shopName}」を削除しますか？`, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(dialog.getByText(`「${shopName}」を削除しますか？`, { exact: true })).not.toBeVisible();
    await dialog.getByRole("button", { name: "閉じる" }).click();
  }

  async deleteShop(shopName: string) {
    const dialog = await this.openShop(shopName);
    await dialog.getByRole("tab", { name: "設定" }).click();
    await dialog.getByRole("button", { name: "この店舗を削除" }).click();
    await expect(dialog.getByText(`「${shopName}」を削除しますか？`, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "削除する" }).click();
    await this.expectToast("店舗を削除しました");
    await expect(dialog).not.toBeVisible();
  }

  private async openPerson(personName: string): Promise<Locator> {
    await this.openPeopleTab();
    await this.personRow(personName).click();
    const dialog = this.page.getByRole("dialog", { name: "ユーザー詳細" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  private async openShop(shopName: string): Promise<Locator> {
    await this.openShopsTab();
    await this.shopRow(shopName).click();
    const dialog = this.page.getByRole("dialog", { name: "店舗詳細" });
    await expect(dialog).toBeVisible();
    return dialog;
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

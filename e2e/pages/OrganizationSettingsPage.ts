import { expect, type Locator, type Page } from "@playwright/test";
import { UserDetailPage } from "./UserDetailPage";

const SETTINGS_DATA_TIMEOUT = 20_000;
const SETTINGS_TAB_LABELS = {
  people: "ユーザー",
  shops: "店舗",
  billing: "プランと支払い",
  settings: "設定",
} as const;
type SettingsTab = keyof typeof SETTINGS_TAB_LABELS;
const SUBSCRIPTION_DELETION_DISABLED_REASON =
  "有料契約またはプラン変更の予約が残っています。「プランと支払い」で契約や予約を終了してから、グループを削除してください。";

export class OrganizationSettingsPage {
  constructor(private page: Page) {}

  async goto(shopId: string, tab: SettingsTab = "people") {
    await this.page.goto(
      `/settings?shop=${encodeURIComponent(shopId)}${tab === "people" ? "" : `&tab=${encodeURIComponent(tab)}`}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/settings" &&
        url.searchParams.get("shop") === shopId &&
        (tab === "people" ? url.searchParams.get("tab") === null : url.searchParams.get("tab") === tab),
      { timeout: SETTINGS_DATA_TIMEOUT },
    );
    const invalidShop = this.page.getByRole("heading", { name: "この店舗を開けません" });
    await expect(this.tabTrigger(tab).or(invalidShop).first()).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
    if (await invalidShop.isVisible()) return;
    await this.expectTabSelected(tab);
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
    await this.openTab("people");
  }

  async openShopsTab() {
    await this.openTab("shops");
  }

  async openBillingTab() {
    await this.openTab("billing");
  }

  async openSettingsTab() {
    await this.openTab("settings");
  }

  async expectBillingTabSelected(shopId: string) {
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/settings" &&
        url.searchParams.get("shop") === shopId &&
        url.searchParams.get("tab") === "billing",
      { timeout: SETTINGS_DATA_TIMEOUT },
    );
    await this.expectTabSelected("billing");
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
      dialog.getByText(new RegExp(`${escapeRegExp(personName)}さんがログインして招待を受け入れると、`)),
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
    await this.openBillingTab();
    await this.expectBillingUsage("利用人数", current, max);
  }

  // 画面のプラン見出しはFreeを「無料」と表示するため、表示ラベルをそのまま受け取る。
  async expectBillingPlan(plan: "無料" | "Pro" | "Business") {
    await this.openBillingTab();
    await expect(this.page.getByRole("heading", { name: plan, exact: true }).first()).toBeVisible({
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async expectBillingUsage(label: "利用人数" | "店舗数" | "管理者数", current: number, max: number) {
    await expect(this.page.getByRole("meter", { name: `${label} ${current} / ${max}`, exact: true })).toBeVisible({
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async expectComplimentaryBusiness() {
    await this.expectBillingPlan("Business");
    await this.expectBillingUsage("利用人数", 1, 40);
    await this.expectBillingUsage("店舗数", 1, 5);
    await this.expectBillingUsage("管理者数", 1, 5);
    await expect(this.page.getByText("Businessの機能を料金なしで利用できます。", { exact: true })).toBeVisible();
    await expect(
      this.page.getByText("現在の利用料金はかかりません。支払い方法の登録は不要です。", { exact: true }),
    ).toBeVisible();
    await expect(this.page.getByRole("button", { name: /(?:Free|Pro|Business)へ変更/ })).toHaveCount(0);
    await expect(this.page.getByRole("button", { name: "支払い方法を見る" })).toHaveCount(0);
  }

  async expectPlanReductionRequired(people: number) {
    await this.openBillingTab();
    await expect(this.page.getByText(`あと${people}名削除してください`, { exact: true })).toBeVisible({
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async expectProLimitApplied() {
    await this.openBillingTab();
    await expect(this.page.getByText("現在はProの上限が適用されています", { exact: true }).first()).toBeVisible({
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async expectPlanReductionResolved() {
    await this.openBillingTab();
    await expect(this.page.getByText(/あと\d+名削除してください/)).toHaveCount(0);
  }

  async expectPlanChangeAvailable(targetPlan: "Free" | "Pro" | "Business") {
    await this.openBillingTab();
    await expect(this.page.getByRole("button", { name: `${targetPlan}へ変更`, exact: true })).toBeVisible({
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  async expectPersonRole(
    personName: string,
    role: "管理者" | "スタッフ",
    options: { hasPendingManagerInvitation?: boolean } = {},
  ) {
    const detail = await this.openUser(personName);
    await detail.expectRole(role, options);
    await detail.returnToSettings();
  }

  async removeManagerRole(personName: string) {
    const detail = await this.openUser(personName);
    await detail.removeManagerRole();
    await detail.returnToSettings();
  }

  async removePerson(personName: string, options: { expectedAssignmentCount?: number } = {}) {
    const detail = await this.openUser(personName);
    await detail.removeFromOrganization(options);
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

  /** 「設定」タブから新しいグループを作り、最初の店舗のDashboardへ遷移するまで待つ。 */
  async createOrganization(shopName: string) {
    await this.openSettingsTab();
    await this.page.getByRole("button", { name: "新しいグループを作る" }).click();
    const dialog = this.page.getByRole("dialog", { name: "新しいグループを作る" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/新しいグループは無料プランで始まります。/)).toBeVisible();
    await dialog.getByLabel(/店舗名|お店の名前/).fill(shopName);

    for (let step = 0; step < 3; step += 1) {
      await dialog.getByRole("button", { name: "次へ" }).click();
    }

    await expect(dialog.getByText("定休日", { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "グループを作る" }).click();
    await this.expectToast("新しいグループを作りました");
    await expect(dialog).not.toBeVisible();

    await expect(this.page).toHaveURL((url) => url.pathname === "/dashboard" && url.searchParams.get("shop") !== null, {
      timeout: SETTINGS_DATA_TIMEOUT,
    });
    const shopId = new URL(this.page.url()).searchParams.get("shop");
    if (!shopId) throw new Error("作成したグループの店舗IDを取得できませんでした");
    return shopId;
  }

  async expectCreateOrganizationDisabled(reason: string) {
    await this.openSettingsTab();
    const createButton = this.page.getByRole("button", { name: "新しいグループを作る" });
    await expect(createButton).toBeDisabled({ timeout: SETTINGS_DATA_TIMEOUT });
    await expect(this.page.getByText(reason, { exact: true })).toBeVisible();
  }

  /**
   * ダークローンチの公開状態と、画面に出ている導線が一致することを確認する。
   *
   * 公開済みの導線は上限に達していればdisabledで描画されるため、有無だけを見る。
   */
  async expectFeatureEntrypoints(features: { organizationCreation: boolean; shopAddition: boolean; billing: boolean }) {
    const billingTab = this.tabTrigger("billing");
    if (features.billing) await expect(billingTab).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
    else await expect(billingTab).toHaveCount(0);

    await this.openShopsTab();
    const addShopButton = this.page.getByRole("button", { name: "店舗を追加" });
    if (features.shopAddition) await expect(addShopButton).toBeVisible();
    else await expect(addShopButton).toHaveCount(0);

    await this.openSettingsTab();
    const createOrganizationButton = this.page.getByRole("button", { name: "新しいグループを作る" });
    if (features.organizationCreation) await expect(createOrganizationButton).toBeVisible();
    else await expect(createOrganizationButton).toHaveCount(0);

    // グループ削除は退会導線のため、ダークローンチ中も残す。
    await expect(this.page.getByRole("button", { name: "削除", exact: true })).toBeVisible();
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
    const row = this.personRow(personName);
    for (let pageIndex = 0; pageIndex < 10 && (await row.count()) === 0; pageIndex += 1) {
      const loadMore = this.page.getByRole("button", { name: "もっと見る", exact: true });
      if ((await loadMore.count()) === 0) break;

      const previousVisibleCount = new URL(this.page.url()).searchParams.get("users");
      await loadMore.click();
      await expect
        .poll(() => new URL(this.page.url()).searchParams.get("users"), { timeout: SETTINGS_DATA_TIMEOUT })
        .not.toBe(previousVisibleCount);
    }
    await expect(row).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
    await row.click();
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

  private async openTab(tab: SettingsTab) {
    const trigger = this.tabTrigger(tab);
    await expect(trigger).toBeVisible({ timeout: SETTINGS_DATA_TIMEOUT });
    if ((await trigger.getAttribute("aria-selected")) !== "true") {
      await trigger.click({ noWaitAfter: true });
    }
    await this.expectTabSelected(tab);
  }

  private async expectTabSelected(tab: SettingsTab) {
    await expect(this.tabTrigger(tab)).toHaveAttribute("aria-selected", "true", {
      timeout: SETTINGS_DATA_TIMEOUT,
    });
  }

  private tabTrigger(tab: SettingsTab) {
    return this.page.getByRole("tab", { name: SETTINGS_TAB_LABELS[tab], exact: true });
  }

  private async expectToast(title: string) {
    await expect(this.page.getByText(title, { exact: true }).first()).toBeVisible();
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

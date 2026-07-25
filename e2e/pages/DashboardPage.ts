import { expect, type Locator, type Page } from "@playwright/test";
import { assertNotificationRecipientSuppressed } from "../helpers/notificationProbe";
import { ShopDetailPage, type ShopSettingsEdit } from "./ShopDetailPage";
import { UserDetailPage } from "./UserDetailPage";

const JAPANESE_WEEKDAYS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;
const DASHBOARD_DATA_TIMEOUT = 20_000;
const SHIFT_BOARD_OPEN_BUTTON_NAME = /回収状況を見る|シフトを組む|シフトを見る/;
const STAFF_ADDED_TOAST_TITLE = /スタッフを追加しました|スタッフを追加し、案内通知を送りました/;
const RECRUITMENT_CREATED_TOAST_TITLE = /募集をつくりました|募集をつくり、スタッフに通知しました/;
const STAFF_REGISTRATION_APPROVED_TOAST_TITLE =
  /スタッフ登録申請を承認しました|スタッフ登録申請を承認し、案内通知を送りました/;
const LINE_INVITE_SENT_TOAST_TITLE =
  /LINE連携URLをメールで送信しました|LINE連携リンクをメールで送信しました|LINE連携リンクをメールで送りました/;

type RecruitmentExpectations = {
  expectedHolidaySummary?: string;
  expectedHolidayDetail?: string;
};

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(shopId?: string) {
    await this.page.goto(shopId ? `/dashboard?shop=${encodeURIComponent(shopId)}` : "/dashboard", {
      waitUntil: "domcontentloaded",
    });
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/dashboard" && (!shopId || url.searchParams.get("shop") === shopId),
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
    await this.expectDashboardReady();
  }

  async expectTrialEndingNoticeVisible() {
    const callout = this.trialEndingNoticeCallout();
    await expect(callout).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(callout.getByRole("link", { name: "プランと支払いを見る", exact: true })).toBeVisible();
  }

  async openTrialEndingNoticeBilling() {
    const link = this.trialEndingNoticeCallout().getByRole("link", { name: "プランと支払いを見る", exact: true });
    await expect(link).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await Promise.all([this.page.waitForURL(/\/settings\?/, { timeout: DASHBOARD_DATA_TIMEOUT }), link.click()]);
  }

  async completeSetup(data: {
    shopName: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    managerName: string;
    managerEmail: string;
  }) {
    assertNotificationRecipientSuppressed(data.managerEmail);
    await this.page.getByRole("button", { name: /お店を登録する/ }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "初回登録" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/店舗名|お店の名前/).fill(data.shopName);

    const setupTimePattern = data.shiftStartTime !== undefined || data.shiftEndTime !== undefined;
    if (setupTimePattern) {
      const timePatternButton = dialog.getByRole("button", { name: /時間指定|時間を自由に設定/ });
      await expect(timePatternButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
      await timePatternButton.click();
    }

    await dialog.getByRole("button", { name: "次へ" }).click();

    if (setupTimePattern) {
      if (data.shiftStartTime !== undefined) {
        await this.selectTime("シフト開始時間", data.shiftStartTime);
      }
      if (data.shiftEndTime !== undefined) {
        await this.selectTime("シフト終了時間", data.shiftEndTime);
      }
      await dialog.getByRole("button", { name: "次へ" }).click();
    }

    await expect(dialog.getByLabel("あなたの名前")).toBeVisible();
    await dialog.getByLabel("あなたの名前").fill(data.managerName);
    await dialog.getByLabel("メールアドレス").fill(data.managerEmail);
    await dialog.locator("[data-scope='checkbox'][data-part='control']").click();
    await dialog.getByRole("button", { name: "お店を登録する" }).click();
  }

  async expectSetupComplete() {
    await expect(this.page.getByText("セットアップが完了しました")).toBeVisible();
  }

  async expectLegalReconsentVisible() {
    await expect(this.legalReconsentMessage()).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectLegalReconsentNotVisible() {
    await expect(this.legalReconsentMessage()).not.toBeVisible();
  }

  async acceptLegalReconsent() {
    await this.page.locator("[data-scope='checkbox'][data-part='control']").click();
    await this.page.getByRole("button", { name: /OK|同意して続ける/ }).click();
    await expect(this.page.getByText("同意を記録しました")).toBeVisible();
    await this.expectLegalReconsentNotVisible();
  }

  async addStaffs(entries: Array<{ name: string; email: string }>) {
    await this.fillAddStaffForm(entries);
    await this.expectToastVisibleThenHidden(STAFF_ADDED_TOAST_TITLE);
  }

  async addStaffsAndExpectError(entries: Array<{ name: string; email: string }>, errorMessage: string) {
    await this.fillAddStaffForm(entries);
    await expect(this.page.getByText(errorMessage).first()).toBeVisible();
    await expect(this.page.getByText(STAFF_ADDED_TOAST_TITLE).first()).toBeHidden();
    const dialog = this.page.getByRole("dialog", { name: "スタッフを招待" });
    await dialog.getByRole("button", { name: "閉じる" }).first().click();
    await expect(dialog).not.toBeVisible();
  }

  async addOrganizationStaff(personName: string, sourceShopName?: string) {
    const inviteButton = this.page.getByRole("button", { name: "スタッフを招待" });
    await expect(inviteButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await inviteButton.click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "スタッフを招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: "他店舗スタッフを招待" }).click();
    const candidate = dialog.getByRole("button", { name: `${personName}をこの店舗に追加` });
    await expect(candidate).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    if (sourceShopName) {
      await expect(candidate.getByText(`所属店舗: ${sourceShopName}`, { exact: true })).toBeVisible();
    }
    await candidate.click();
    await this.expectToastVisibleThenHidden("スタッフを追加しました");
    await expect(dialog).not.toBeVisible();
  }

  async getStaffRegistrationToken() {
    const inviteButton = this.page.getByRole("button", { name: "スタッフを招待" });
    await expect(inviteButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await inviteButton.click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "スタッフを招待" });
    await expect(dialog).toBeVisible();
    const registrationUrlText = dialog.getByText(/\/staff\/register\?token=/).first();
    await expect(registrationUrlText).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    const registrationUrl = (await registrationUrlText.textContent())?.trim();
    if (!registrationUrl) throw new Error("スタッフ登録URLを取得できませんでした");
    const token = new URL(registrationUrl).searchParams.get("token");
    if (!token) throw new Error("スタッフ登録URLにtokenがありません");
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).not.toBeVisible();
    return token;
  }

  async expectOrganizationStaffNotCandidate(personName: string) {
    const inviteButton = this.page.getByRole("button", { name: "スタッフを招待" });
    await expect(inviteButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await inviteButton.click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "スタッフを招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: "他店舗スタッフを招待" }).click();
    await expect(
      dialog
        .getByText(
          "同じグループに所属し、この店舗にはまだ登録されていないスタッフです。スタッフを押すと、この店舗に追加します。",
        )
        .or(dialog.getByText("追加できるスタッフはいません"))
        .first(),
    ).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(dialog.getByRole("button", { name: `${personName}をこの店舗に追加` })).toHaveCount(0);
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).not.toBeVisible();
  }

  private async fillAddStaffForm(entries: Array<{ name: string; email: string }>) {
    const inviteButton = this.page.getByRole("button", { name: "スタッフを招待" });
    await expect(inviteButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await inviteButton.click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "スタッフを招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: "管理者が登録" }).click();

    const form = this.page.locator("[id='add-staff-form']");
    const nameInputs = form.getByPlaceholder("例：田中 花子");
    const emailInputs = form.getByPlaceholder("例：hanako@example.com");

    for (let i = 0; i < entries.length; i++) {
      await nameInputs.nth(i).fill(entries[i].name);
      await emailInputs.nth(i).fill(entries[i].email);
    }

    // 余剰行を削除（フォームの初期行数 > 入力数の場合）
    const deleteButtons = dialog.getByRole("button", { name: "削除" });
    while ((await deleteButtons.count()) > entries.length) {
      await deleteButtons.last().click();
    }

    await dialog.getByRole("button", { name: "スタッフを追加する" }).click();
  }

  async createRecruitment(
    data: { periodStart: string; periodEnd: string; deadline: string },
    expectations: RecruitmentExpectations = {},
  ) {
    await this.page.getByRole("button", { name: "新しい募集をつくる" }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "新しい募集をつくる" });
    await expect(dialog).toBeVisible();

    await this.selectCalendarDate(dialog, data.periodStart);
    await this.selectCalendarDate(dialog, data.periodEnd);
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("お店のお休みを選択")).toBeVisible();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("提出締切日を選択")).toBeVisible();
    await this.selectCalendarDate(dialog, data.deadline);
    await dialog.getByRole("button", { name: "確認へ" }).click();

    await expect(dialog.getByText("内容を確認", { exact: true })).toBeVisible();
    if (expectations.expectedHolidaySummary) {
      await expect(dialog.getByText("お店のお休み")).toBeVisible();
      await expect(dialog.getByText(expectations.expectedHolidaySummary, { exact: true })).toBeVisible();
    }
    if (expectations.expectedHolidayDetail) {
      await expect(dialog.getByText(expectations.expectedHolidayDetail, { exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: "募集をつくる" }).click();
    await this.expectToastVisibleThenHidden(RECRUITMENT_CREATED_TOAST_TITLE);
  }

  async openShiftBoard() {
    const openButton = this.shiftBoardOpenButton().first();
    await expect(openButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    const warningDialog = this.page.getByRole("alertdialog", { name: "まだ希望がそろっていません" });
    const navigated = this.page.waitForURL(/\/shiftboard\//, { timeout: DASHBOARD_DATA_TIMEOUT }).then(
      () => false,
      () => false,
    );
    const dialogAppeared = warningDialog.waitFor({ state: "visible", timeout: DASHBOARD_DATA_TIMEOUT }).then(
      () => true,
      () => false,
    );
    await openButton.click();
    // 未提出者がいる募集では確認ダイアログを挟む。提出済みシナリオと未提出シナリオの両方で使うため、
    // URL遷移とdialog表示を競争させて、どちらの導線でも同じPOMから進める。
    if (await Promise.race([dialogAppeared, navigated.then(() => false)])) {
      await warningDialog.getByRole("button", { name: "このまま進む" }).click();
    }
    await expect(this.page).toHaveURL(/\/shiftboard\//, { timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectStaffSectionVisible() {
    await expect(this.page.getByRole("heading", { name: "スタッフ一覧", exact: true })).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.staffSection().getByText(name)).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async openUserDetail(staffName: string) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "legacy") {
      throw new Error(`${staffName}は組織ユーザー詳細へ移行されていません`);
    }
    return detail.user;
  }

  async editStaff(staffName: string, newData: { name: string; email: string }) {
    assertNotificationRecipientSuppressed(newData.email);
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.editProfile(newData);
      await detail.user.returnToDashboard();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "情報" }).click();
    const form = this.page.locator("[id='edit-staff-form']");
    const nameInput = form.getByPlaceholder("例：田中 花子");
    const emailInput = form.getByPlaceholder("例：hanako@example.com");
    await nameInput.clear();
    await nameInput.fill(newData.name);
    await emailInput.clear();
    await emailInput.fill(newData.email);
    await detail.dialog.getByRole("button", { name: "変更を保存" }).click();
    await this.expectToastVisibleThenHidden("スタッフ情報を更新しました");
    await this.closeLegacyStaffDialog(detail.dialog);
  }

  async deleteStaff(staffName: string) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.removeFromShop();
      await detail.user.returnToDashboard();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "設定" }).click();
    await detail.dialog.getByRole("button", { name: "スタッフを削除" }).click();
    await expect(detail.dialog.getByText("この店舗のスタッフ所属を削除しますか？", { exact: true })).toBeVisible();
    await detail.dialog.getByRole("button", { name: "店舗から削除", exact: true }).click();
    await this.expectToastVisibleThenHidden("この店舗のスタッフ所属を削除しました");
  }

  async setStaffShiftTarget(staffName: string, isShiftTarget: boolean) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.setShiftTarget(isShiftTarget);
      await detail.user.returnToDashboard();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "設定" }).click();

    const shiftTargetSwitch = detail.dialog.getByRole("checkbox", { name: /シフト対象/ });
    await expect(shiftTargetSwitch).toBeVisible();
    if ((await shiftTargetSwitch.isChecked()) !== isShiftTarget) {
      await shiftTargetSwitch.press("Space");
      await this.expectToastVisibleThenHidden(isShiftTarget ? "シフト対象に戻しました" : "シフト対象外にしました");
      await expect(shiftTargetSwitch).toBeChecked({ checked: isShiftTarget });
    }

    await this.closeLegacyStaffDialog(detail.dialog);
  }

  async sendOpenRecruitmentNotification(staffName: string) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.sendOpenRecruitmentNotification();
      await detail.user.returnToDashboard();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "通知" }).click();
    await detail.dialog.getByRole("button", { name: "募集中のシフトを送る" }).click();
    await this.expectToastVisibleThenHidden("シフト募集通知を送りました");
    await this.closeLegacyStaffDialog(detail.dialog);
  }

  async sendCurrentShiftNotification(staffName: string) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.sendCurrentShiftNotification();
      await detail.user.returnToDashboard();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "通知" }).click();
    await detail.dialog.getByRole("button", { name: "確定シフトを送る" }).click();
    await this.expectToastVisibleThenHidden("現在の確定シフトを送りました");
    await this.closeLegacyStaffDialog(detail.dialog);
  }

  async deleteRecruitment() {
    await this.recruitmentSection()
      .getByRole("button", { name: /募集操作メニュー/ })
      .first()
      .click();
    await this.page.getByRole("menuitem", { name: "募集を削除" }).click();

    const dialog = this.page.getByRole("alertdialog", { name: /シフト募集を削除/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/本当に削除してよろしいですか？|この募集を削除すると元に戻せません。/)).toBeVisible();
    await dialog.getByRole("button", { name: "この募集を削除" }).click();
    await expect(this.page.getByText("シフト募集を削除しました")).toBeVisible();
  }

  async expectSetupRequired() {
    await expect(this.page.getByRole("heading", { name: "お店の情報を登録しましょう" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    await expect(this.page.getByRole("button", { name: "お店を登録する" })).toBeVisible();
  }

  async openLineQr(staffName: string) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.openLineQr();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "LINE" }).click();
    await detail.dialog.getByRole("button", { name: "LINE連携リンクを表示" }).click();
    await expect(detail.dialog.getByRole("img", { name: "LINE連携用QRコード" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    await expect(detail.dialog.getByTitle(/^https:\/\//)).toBeVisible();
    await expect(detail.dialog.getByRole("button", { name: "リンクをコピー" })).toBeVisible();
  }

  async sendLineInvite(staffName: string) {
    const detail = await this.openStaffDetail(staffName);
    if (detail.kind === "user") {
      await detail.user.sendLineInvite();
      await detail.user.returnToDashboard();
      return;
    }

    await detail.dialog.getByRole("tab", { name: "LINE" }).click();
    await detail.dialog.getByRole("button", { name: "メールでLINE連携リンクを送る" }).click();
    await this.expectToastVisibleThenHidden(LINE_INVITE_SENT_TOAST_TITLE);
    await this.closeLegacyStaffDialog(detail.dialog);
  }

  async expectStaffNotVisible(name: string) {
    await this.expectDashboardDataLoaded();
    await expect(this.staffSection().getByText(name)).not.toBeVisible();
  }

  async openUserMenu() {
    await this.page.getByRole("button", { name: "ユーザーメニュー" }).click();
  }

  async expectUserMenuInfo(name: string, email: string) {
    await this.openUserMenu();
    const menu = this.page.getByRole("menu");
    await expect(menu.getByText(name)).toBeVisible();
    await expect(menu.getByText(email)).toBeVisible();
    // メニューを閉じる
    await this.page.keyboard.press("Escape");
  }

  async expectRecruitmentCardVisible() {
    await expect(this.recruitmentOpenButton().first()).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectStaffRegistrationRequestBanner(count: number) {
    await expect(this.page.getByText(new RegExp(`スタッフ登録申請が\\s*${count}\\s*件あります`))).toBeVisible();
  }

  async expectStaffRegistrationRequestBannerHidden() {
    await expect(this.page.getByText(/スタッフ登録申請が\s*\d+\s*件あります/)).not.toBeVisible();
  }

  async openStaffRegistrationRequests() {
    await this.page.getByRole("button", { name: /確認する|申請を確認/ }).click();
    await expect(this.staffRegistrationRequestDialog()).toBeVisible();
  }

  async approveStaffRegistrationRequest(name: string) {
    const dialog = this.staffRegistrationRequestDialog();
    await dialog.getByRole("button", { name: `${name}を承認` }).click();
    await expect(this.page.getByText(STAFF_REGISTRATION_APPROVED_TOAST_TITLE).first()).toBeVisible();
    await expect(dialog).not.toBeVisible();
  }

  async rejectStaffRegistrationRequest(name: string) {
    const dialog = this.staffRegistrationRequestDialog();
    await dialog.getByRole("button", { name: `${name}を却下` }).click();

    const alertDialog = this.page.getByRole("alertdialog", { name: "スタッフ登録申請を却下" });
    await expect(alertDialog).toBeVisible();
    await alertDialog.getByRole("button", { name: "この申請を却下" }).click();

    await expect(this.page.getByText("スタッフ登録申請を却下しました")).toBeVisible();
    await expect(dialog).not.toBeVisible();
  }

  private recruitmentOpenButton() {
    return this.recruitmentSection().getByRole("button", { name: SHIFT_BOARD_OPEN_BUTTON_NAME });
  }

  private shiftBoardOpenButton() {
    return this.recruitmentOpenButton()
      .or(this.currentShiftSection().getByRole("button", { name: SHIFT_BOARD_OPEN_BUTTON_NAME }))
      .or(this.page.getByRole("button", { name: /回収状況を見る|シフトを組む/ }));
  }

  async editShopSettings(data: ShopSettingsEdit) {
    const shopDetail = new ShopDetailPage(this.page);
    await shopDetail.openFromDashboard();
    await shopDetail.editSettings(data);
    await shopDetail.returnToDashboard();
  }

  async expectShopName(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async expectSelectedShop(shopName: string, shopId: string) {
    await expect(this.page).toHaveURL(new RegExp(`/dashboard\\?shop=${escapeRegExp(shopId)}(?:&|$)`));
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  async switchShop(shopName: string, expectedShopId?: string) {
    await this.page.getByRole("button", { name: /店舗を切り替える。現在は/ }).click();
    await this.page.getByRole("menuitem").filter({ hasText: shopName }).click();
    await expect(this.page).toHaveURL(/\/dashboard\?shop=/, { timeout: DASHBOARD_DATA_TIMEOUT });
    const selectedShopId = new URL(this.page.url()).searchParams.get("shop");
    if (!selectedShopId) throw new Error("店舗切替後のURLにshopがありません");
    await this.expectSelectedShop(shopName, expectedShopId ?? selectedShopId);
    return selectedShopId;
  }

  async expectOrganizationGroupsInShopSwitcher(organizationNames: string[]) {
    await this.page.getByRole("button", { name: /店舗を切り替える。現在は/ }).click();
    // グループ名と店舗名が同じ場合でも見出しだけを対象にするため、グループ見出しの要素へ限定する。
    const groupLabels = this.page.getByRole("menu").locator('[data-part="item-group-label"]');
    for (const organizationName of organizationNames) {
      await expect(groupLabels.filter({ hasText: organizationName })).toHaveCount(1);
    }
    await this.page.keyboard.press("Escape");
  }

  async expectShopNotSelectable(shopName: string, currentShopName: string, currentShopId: string) {
    await this.expectSelectedShop(currentShopName, currentShopId);
    const switcher = this.page.getByRole("button", { name: /店舗を切り替える。現在は/ });
    if ((await switcher.count()) === 0) return;
    await switcher.click();
    await expect(this.page.getByRole("menuitem").filter({ hasText: shopName })).toHaveCount(0);
    await this.page.keyboard.press("Escape");
  }

  async expectInvalidShop() {
    await expect(this.page.getByRole("heading", { name: "この店舗を開けません" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  async returnFromInvalidShop() {
    await this.page.getByRole("button", { name: "ダッシュボードへ戻る" }).click();
    await expect(this.page).toHaveURL(/\/dashboard\?shop=/, { timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectShopTimeRange(timeRange: string) {
    const shopDetail = new ShopDetailPage(this.page);
    await shopDetail.openFromDashboard();
    await shopDetail.expectTimeRange(timeRange);
    await shopDetail.returnToDashboard();
  }

  async clickShowAllStaffs() {
    await this.staffSection().getByRole("button", { name: "もっと見る" }).click();
  }

  async expectRecruitmentCardCount(count: number) {
    await this.expectDashboardDataLoaded();
    await expect(this.recruitmentOpenButton()).toHaveCount(count, { timeout: DASHBOARD_DATA_TIMEOUT });
  }

  private async expectDashboardDataLoaded() {
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  private async expectDashboardReady() {
    const readyState = this.page
      .getByRole("button", { name: "新しい募集をつくる" })
      .or(this.page.getByRole("button", { name: /お店を登録する/ }))
      .or(this.page.getByRole("heading", { name: "この店舗を開けません" }))
      .first();
    await expect(readyState).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectStaffRowCount(count: number) {
    await expect(this.staffSection().getByRole("button", { name: /の(?:ユーザー|スタッフ)詳細を開く$/ })).toHaveCount(
      count,
    );
  }

  async expectStaffShiftExcludedBadge(staffName: string, isVisible: boolean) {
    const badge = this.staffRow(staffName).getByText("シフト対象外", { exact: true });
    if (isVisible) {
      await expect(badge).toBeVisible();
      return;
    }
    await expect(badge).not.toBeVisible();
  }

  async expectShowAllStaffsVisible() {
    await expect(this.staffSection().getByRole("button", { name: "もっと見る" })).toBeVisible();
  }

  async expectShowAllStaffsNotVisible() {
    await expect(this.staffSection().getByRole("button", { name: "もっと見る" })).not.toBeVisible();
  }

  private recruitmentSection() {
    return this.page.getByRole("region", { name: "シフト一覧" });
  }

  private currentShiftSection() {
    return this.page.getByRole("region", { name: "現在のシフト" });
  }

  private staffSection() {
    return this.page.getByRole("region", { name: "スタッフ一覧" });
  }

  private trialEndingNoticeCallout() {
    return this.page.getByRole("region", { name: "トライアル終了前の支払い案内" });
  }

  private staffRegistrationRequestDialog() {
    return this.page.getByRole("dialog", { name: "スタッフ登録申請" });
  }

  private staffDetailDialog() {
    return this.page.getByRole("dialog", { name: "スタッフ詳細" });
  }

  private legalReconsentMessage() {
    return this.page.getByText("利用規約・プライバシーポリシーを更新しました");
  }

  private async expectToastVisibleThenHidden(title: string | RegExp) {
    const toast = this.page.locator("[data-scope='toast'][data-part='root']").filter({ hasText: title }).first();
    await expect(toast).toBeVisible();
    // 自動消滅は文字数に応じて最大8秒かかりテスト全体がタイムアウトするため、
    // 閉じるボタン（全トーストに存在）を直接発火して即座に閉じる。
    // 座標クリックだと、トースト消滅の瞬間に下のダイアログへクリックが落ちることがある。
    await toast.locator("[data-part='close-trigger']").evaluate((element: HTMLElement) => element.click());
    // exit animation中も表示扱いになるため、閉じた状態またはDOMからの削除を完了条件にする。
    await expect(toast).not.toHaveAttribute("data-state", "open");
  }

  private async openStaffDetail(staffName: string) {
    await this.expectDashboardDataLoaded();
    const contextHeading = this.page.getByRole("heading", { level: 1 }).first();
    await expect(contextHeading).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    const contextShopName = (await contextHeading.textContent())?.trim();
    const contextShopId = new URL(this.page.url()).searchParams.get("shop");
    const row = this.staffRow(staffName);
    await expect(row).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await row.click({ noWaitAfter: true });
    const legacyDialog = this.staffDetailDialog();
    const kind = await Promise.any([
      this.page.waitForURL(/\/users\/[^/?]+/, { timeout: DASHBOARD_DATA_TIMEOUT }).then(() => "user" as const),
      legacyDialog.waitFor({ state: "visible", timeout: DASHBOARD_DATA_TIMEOUT }).then(() => "legacy" as const),
    ]);

    if (kind === "user") {
      const contextShop = contextShopId && contextShopName ? { id: contextShopId, name: contextShopName } : undefined;
      const user = new UserDetailPage(this.page, staffName, contextShop);
      await user.expectLoaded();
      return { kind, user } as const;
    }

    return { kind, dialog: legacyDialog } as const;
  }

  private staffRow(staffName: string) {
    return this.staffSection()
      .getByRole("button", { name: `${staffName}のユーザー詳細を開く` })
      .or(this.staffSection().getByRole("button", { name: `${staffName}のスタッフ詳細を開く` }));
  }

  // 同名オプションが複数Select間で重複するため、listbox にスコープして選択
  private async selectTime(label: string, value: string) {
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page
      .getByRole("listbox", { name: label })
      .getByRole("option", { name: value, exact: true })
      .click({ noWaitAfter: true });
  }

  private async closeLegacyStaffDialog(dialog: Locator) {
    await dialog.getByRole("button", { name: "閉じる" }).first().click();
    await expect(dialog).not.toBeVisible();
  }

  private async selectCalendarDate(scope: Locator, date: string) {
    const button = scope.getByRole("button", {
      name: new RegExp(`^Choose ${escapeRegExp(formatCalendarAriaDate(date))}$`),
    });
    await expect(button).toBeVisible();
    await button.click();
  }
}

function formatCalendarAriaDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = JAPANESE_WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${year}年${month}月${day}日${weekday}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

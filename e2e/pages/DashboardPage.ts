import { expect, type Page } from "@playwright/test";

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dashboard");
  }

  async completeSetup(data: {
    shopName: string;
    shiftStartTime: string;
    shiftEndTime: string;
    ownerName: string;
    ownerEmail: string;
  }) {
    await this.page.getByRole("button", { name: /お店を登録する/ }).click();
    await expect(this.page.getByRole("dialog", { name: /店舗情報を登録|お店の情報を登録/ })).toBeVisible();
    await this.page.getByLabel(/店舗名|お店の名前/).fill(data.shopName);
    await this.selectTime("シフト開始時間", data.shiftStartTime);
    await this.selectTime("シフト終了時間", data.shiftEndTime);
    await this.page.getByRole("button", { name: "次へ" }).click();

    const ownerDialog = this.page.getByRole("dialog", { name: "あなたの名前を登録" });
    await expect(ownerDialog).toBeVisible();
    await ownerDialog.getByLabel("あなたの名前").fill(data.ownerName);
    await ownerDialog.getByLabel("メールアドレス").fill(data.ownerEmail);
    await ownerDialog.locator("[data-scope='checkbox'][data-part='control']").click();
    await ownerDialog.getByRole("button", { name: "お店を登録する" }).click();
  }

  async expectSetupComplete() {
    await expect(this.page.getByText("セットアップが完了しました")).toBeVisible();
  }

  async expectLegalReconsentVisible() {
    await expect(this.legalReconsentMessage()).toBeVisible();
  }

  async expectLegalReconsentNotVisible() {
    await expect(this.legalReconsentMessage()).not.toBeVisible();
  }

  async acceptLegalReconsent() {
    await this.page.locator("[data-scope='checkbox'][data-part='control']").click();
    await this.page.getByRole("button", { name: "OK" }).click();
    await expect(this.page.getByText("同意を記録しました")).toBeVisible();
    await this.expectLegalReconsentNotVisible();
  }

  async addStaffs(entries: Array<{ name: string; email: string }>) {
    await this.page.getByRole("button", { name: "スタッフを追加" }).click();
    await expect(this.page.getByRole("dialog", { name: "スタッフを追加" })).toBeVisible();

    const form = this.page.locator("[id='add-staff-form']");
    const nameInputs = form.getByPlaceholder("例：田中 花子");
    const emailInputs = form.getByPlaceholder("例：hanako@example.com");

    for (let i = 0; i < entries.length; i++) {
      await nameInputs.nth(i).fill(entries[i].name);
      await emailInputs.nth(i).fill(entries[i].email);
    }

    // 余剰行を削除（フォームの初期行数 > 入力数の場合）
    const deleteButtons = this.page.getByRole("dialog").getByRole("button", { name: "削除" });
    while ((await deleteButtons.count()) > entries.length) {
      await deleteButtons.last().click();
    }

    await this.page.getByRole("dialog").getByRole("button", { name: "スタッフを追加する" }).click();
    await expect(this.page.getByText("スタッフを追加しました").first()).toBeVisible();
    await expect(this.page.getByText("スタッフを追加しました").first()).not.toBeVisible();
  }

  async createRecruitment(data: { periodStart: string; periodEnd: string; deadline: string }) {
    await this.page.getByRole("button", { name: "新しい募集をつくる" }).click();
    await expect(this.page.getByRole("dialog", { name: "新しい募集をつくる" })).toBeVisible();

    const form = this.page.locator("[id='create-recruitment-form']");
    const dateInputs = form.locator("input[type='date']");
    await dateInputs.nth(0).fill(data.periodStart);
    await dateInputs.nth(1).fill(data.periodEnd);
    await dateInputs.nth(2).fill(data.deadline);

    await this.page.getByRole("dialog").getByRole("button", { name: "募集をつくる" }).click();
    await expect(this.page.getByText("募集をつくりました").first()).toBeVisible();
    await expect(this.page.getByText("募集をつくりました").first()).not.toBeVisible();
  }

  async openShiftBoard() {
    await this.recruitmentOpenButton().first().click();
    const warningDialog = this.page.getByRole("alertdialog", { name: "まだ希望がそろっていません" });
    const navigated = this.page.waitForURL(/\/shiftboard\//);
    const dialogAppeared = warningDialog.waitFor({ state: "visible" }).then(() => true);
    // 未提出者がいる募集では確認ダイアログを挟む。提出済みシナリオと未提出シナリオの両方で使うため、
    // URL遷移とdialog表示を競争させて、どちらの導線でも同じPOMから進める。
    if (await Promise.race([dialogAppeared, navigated.then(() => false)])) {
      await warningDialog.getByRole("button", { name: "このまま進む" }).click();
      await navigated;
    }
  }

  async expectStaffSectionVisible() {
    await expect(this.page.getByRole("heading", { name: "スタッフ一覧", exact: true })).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.staffSection().getByText(name)).toBeVisible();
  }

  async editStaff(staffName: string, newData: { name: string; email: string }) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: "編集" }).click();

    await expect(this.page.getByRole("dialog", { name: "スタッフを編集" })).toBeVisible();
    const form = this.page.locator("[id='edit-staff-form']");
    const nameInput = form.getByPlaceholder("例：田中 花子");
    const emailInput = form.getByPlaceholder("例：hanako@example.com");

    await nameInput.clear();
    await nameInput.fill(newData.name);
    await emailInput.clear();
    await emailInput.fill(newData.email);

    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /保存する|変更を保存/ })
      .click();
    await expect(this.page.getByText("スタッフ情報を更新しました")).toBeVisible();
  }

  async deleteStaff(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: "削除" }).click();

    await expect(this.page.getByRole("alertdialog", { name: "スタッフを削除" })).toBeVisible();
    await this.page
      .getByRole("alertdialog")
      .getByRole("button", { name: /削除する|このスタッフを削除/ })
      .click();
    await expect(this.page.getByText("スタッフを削除しました")).toBeVisible();
  }

  async openLineQr(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: /LINE連携QRを表示|LINE連携リンクを表示/ }).click();
    await expect(this.page.getByRole("dialog", { name: /LINE連携QR \/ URL|LINE連携リンク/ })).toBeVisible();
  }

  async sendLineInvite(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: /メールでLINE連携URLを送る|LINE連携リンクをメールで送る/ }).click();

    const dialog = this.page.getByRole("dialog", { name: /メールでLINE連携URLを送る|LINE連携リンクをメールで送る/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "送信" }).click();
    await expect(
      this.page.getByText(/LINE連携URLをメールで送信しました|LINE連携リンクをメールで送信しました/),
    ).toBeVisible();
  }

  async expectStaffNotVisible(name: string) {
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
    await expect(this.recruitmentOpenButton().first()).toBeVisible();
  }

  private recruitmentOpenButton() {
    return this.recruitmentSection().getByRole("button", { name: /希望を見る|シフトを組む|シフトを見る/ });
  }

  async editShopSettings(data: { shopName?: string; shiftStartTime?: string; shiftEndTime?: string }) {
    await this.page.getByRole("button", { name: "店舗設定を編集" }).click();
    await expect(this.page.getByRole("dialog", { name: "店舗設定" })).toBeVisible();

    if (data.shopName !== undefined) {
      const nameInput = this.page.getByLabel(/店舗名|お店の名前/);
      await nameInput.clear();
      await nameInput.fill(data.shopName);
    }
    if (data.shiftStartTime !== undefined) {
      await this.selectTime("シフト開始時間", data.shiftStartTime);
    }
    if (data.shiftEndTime !== undefined) {
      await this.selectTime("シフト終了時間", data.shiftEndTime);
    }

    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /保存する|変更を保存/ })
      .click();
    await expect(this.page.getByText("店舗設定を更新しました")).toBeVisible();
  }

  async expectShopName(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async expectShopTimeRange(timeRange: string) {
    await expect(this.page.getByText(timeRange)).toBeVisible();
  }

  // ページネーション関連
  async clickLoadMoreRecruitments() {
    await this.recruitmentSection().getByRole("button", { name: "もっと見る" }).click();
  }

  async clickShowAllStaffs() {
    await this.staffSection().getByRole("button", { name: "もっと見る" }).click();
  }

  async expectRecruitmentCardCount(count: number) {
    await expect(this.recruitmentOpenButton()).toHaveCount(count);
  }

  async expectStaffRowCount(count: number) {
    await expect(this.staffSection().getByRole("button", { name: "スタッフの操作メニュー" })).toHaveCount(count);
  }

  async expectLoadMoreRecruitmentVisible() {
    await expect(this.recruitmentSection().getByRole("button", { name: "もっと見る" })).toBeVisible();
  }

  async expectLoadMoreRecruitmentNotVisible() {
    await expect(this.recruitmentSection().getByRole("button", { name: "もっと見る" })).not.toBeVisible();
  }

  async expectShowAllStaffsVisible() {
    await expect(this.staffSection().getByRole("button", { name: "もっと見る" })).toBeVisible();
  }

  async expectShowAllStaffsNotVisible() {
    await expect(this.staffSection().getByRole("button", { name: "もっと見る" })).not.toBeVisible();
  }

  private recruitmentSection() {
    return this.page.getByRole("region", { name: "シフト募集" });
  }

  private staffSection() {
    return this.page.getByRole("region", { name: "スタッフ一覧" });
  }

  private legalReconsentMessage() {
    return this.page.getByText("利用規約・プライバシーポリシーを更新しました");
  }

  private async openStaffMenu(staffName: string) {
    const row = this.staffSection().getByRole("article", { name: `${staffName}のスタッフ情報` });
    await row.getByRole("button", { name: "スタッフの操作メニュー" }).click();
  }

  // 同名オプションが複数Select間で重複するため、listbox にスコープして選択
  private async selectTime(label: string, value: string) {
    // Chakra Select は同じ時刻 option が複数のlistboxに出るため、開いたcomboboxのラベルでスコープする。
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page.getByRole("listbox", { name: label }).getByRole("option", { name: value, exact: true }).click();
  }
}

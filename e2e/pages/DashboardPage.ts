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
    await this.page.getByLabel("店舗名").fill(data.shopName);
    await this.selectTime("シフト開始時間", data.shiftStartTime);
    await this.selectTime("シフト終了時間", data.shiftEndTime);
    await this.page.getByRole("button", { name: "次へ" }).click();

    await this.page.getByLabel("あなたの名前").fill(data.ownerName);
    await this.page.getByLabel("メールアドレス").fill(data.ownerEmail);
    await this.page.getByRole("button", { name: "登録する" }).click();
  }

  async expectSetupComplete() {
    await expect(this.page.getByText("セットアップが完了しました")).toBeVisible();
  }

  async addStaffs(entries: Array<{ name: string; email: string }>) {
    await this.page.getByRole("button", { name: "スタッフを追加" }).click();
    await expect(this.page.getByRole("dialog", { name: "スタッフを追加" })).toBeVisible();

    const form = this.page.locator("[id='add-staff-form']");
    const nameInputs = form.getByPlaceholder("例: 田中 花子");
    const emailInputs = form.getByPlaceholder("例: hanako@example.com");

    for (let i = 0; i < entries.length; i++) {
      await nameInputs.nth(i).fill(entries[i].name);
      await emailInputs.nth(i).fill(entries[i].email);
    }

    // 余剰行を削除（フォームの初期行数 > 入力数の場合）
    const deleteButtons = this.page.getByRole("dialog").getByRole("button", { name: "削除" });
    while ((await deleteButtons.count()) > entries.length) {
      await deleteButtons.last().click();
    }

    await this.page.getByRole("dialog").getByRole("button", { name: "登録する" }).click();
    await expect(this.page.getByText("スタッフを追加しました").first()).toBeVisible();
    await expect(this.page.getByText("スタッフを追加しました").first()).not.toBeVisible();
  }

  async createRecruitment(data: { periodStart: string; periodEnd: string; deadline: string }) {
    await this.page.getByRole("button", { name: "シフト希望を集める" }).click();
    await expect(this.page.getByRole("dialog", { name: "シフト希望を集める" })).toBeVisible();

    const form = this.page.locator("[id='create-recruitment-form']");
    const dateInputs = form.locator("input[type='date']");
    await dateInputs.nth(0).fill(data.periodStart);
    await dateInputs.nth(1).fill(data.periodEnd);
    await dateInputs.nth(2).fill(data.deadline);

    await this.page.getByRole("dialog").getByRole("button", { name: "作成する" }).click();
    await expect(this.page.getByText("シフトを作成しました").first()).toBeVisible();
    await expect(this.page.getByText("シフトを作成しました").first()).not.toBeVisible();
  }

  async openShiftBoard() {
    await this.page.getByRole("button", { name: "シフトを編集する" }).click();
    const warningDialog = this.page.getByRole("alertdialog", { name: "シフト希望がまだ変わるかも" });
    const navigated = this.page.waitForURL(/\/shiftboard\//);
    const dialogAppeared = warningDialog.waitFor({ state: "visible" }).then(() => true);
    if (await Promise.race([dialogAppeared, navigated.then(() => false)])) {
      await warningDialog.getByRole("button", { name: "編集画面へ進む" }).click();
      await navigated;
    }
  }

  async expectStaffSectionVisible() {
    await expect(this.page.getByRole("heading", { name: "スタッフ", exact: true })).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async editStaff(staffName: string, newData: { name: string; email: string }) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: "編集" }).click();

    await expect(this.page.getByRole("dialog", { name: "スタッフを編集" })).toBeVisible();
    const form = this.page.locator("[id='edit-staff-form']");
    const nameInput = form.getByPlaceholder("例: 田中 花子");
    const emailInput = form.getByPlaceholder("例: hanako@example.com");

    await nameInput.clear();
    await nameInput.fill(newData.name);
    await emailInput.clear();
    await emailInput.fill(newData.email);

    await this.page.getByRole("dialog").getByRole("button", { name: "更新する" }).click();
    await expect(this.page.getByText("スタッフ情報を更新しました")).toBeVisible();
  }

  async deleteStaff(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: "削除" }).click();

    await expect(this.page.getByRole("alertdialog", { name: "スタッフを削除" })).toBeVisible();
    await this.page.getByRole("alertdialog").getByRole("button", { name: "削除する" }).click();
    await expect(this.page.getByText("スタッフを削除しました")).toBeVisible();
  }

  async expectStaffNotVisible(name: string) {
    await expect(this.page.getByText(name)).not.toBeVisible();
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
    await expect(this.page.getByRole("button", { name: "シフトを編集する" })).toBeVisible();
  }

  async editShopSettings(data: { shopName?: string; shiftStartTime?: string; shiftEndTime?: string }) {
    await this.page.getByRole("button", { name: "店舗設定を編集" }).click();
    await expect(this.page.getByRole("dialog", { name: "店舗設定" })).toBeVisible();

    if (data.shopName !== undefined) {
      const nameInput = this.page.getByLabel("店舗名");
      await nameInput.clear();
      await nameInput.fill(data.shopName);
    }
    if (data.shiftStartTime !== undefined) {
      await this.selectTime("シフト開始時間", data.shiftStartTime);
    }
    if (data.shiftEndTime !== undefined) {
      await this.selectTime("シフト終了時間", data.shiftEndTime);
    }

    await this.page.getByRole("dialog").getByRole("button", { name: "保存する" }).click();
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
    await this.page.getByRole("button", { name: "もっと見る" }).click();
  }

  async clickShowAllStaffs() {
    await this.page.getByRole("button", { name: "すべて表示" }).click();
  }

  async expectRecruitmentCardCount(count: number) {
    await expect(this.page.getByRole("button", { name: "シフトを編集する" })).toHaveCount(count);
  }

  async expectStaffRowCount(count: number) {
    const staffSection = this.page
      .getByRole("heading", { name: "スタッフ", exact: true })
      .locator("xpath=ancestor::*[4]");
    await expect(staffSection.getByRole("button", { name: "メニュー" })).toHaveCount(count);
  }

  async expectLoadMoreRecruitmentVisible() {
    await expect(this.page.getByRole("button", { name: "もっと見る" })).toBeVisible();
  }

  async expectLoadMoreRecruitmentNotVisible() {
    await expect(this.page.getByRole("button", { name: "もっと見る" })).not.toBeVisible();
  }

  async expectShowAllStaffsVisible() {
    await expect(this.page.getByRole("button", { name: "すべて表示" })).toBeVisible();
  }

  async expectShowAllStaffsNotVisible() {
    await expect(this.page.getByRole("button", { name: "すべて表示" })).not.toBeVisible();
  }

  private async openStaffMenu(staffName: string) {
    const row = this.page.getByText(staffName).locator("xpath=ancestor::div[.//button[@aria-label='メニュー']][1]");
    await row.getByRole("button", { name: "メニュー" }).click();
  }

  // 同名オプションが複数Select間で重複するため、listbox にスコープして選択
  private async selectTime(label: string, value: string) {
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page.getByRole("listbox", { name: label }).getByRole("option", { name: value, exact: true }).click();
  }
}

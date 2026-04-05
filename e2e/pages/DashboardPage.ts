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
    await expect(
      this.page.getByText("セットアップが完了しました"),
    ).toBeVisible();
  }

  async addStaffs(entries: Array<{ name: string; email: string }>) {
    await this.page.getByRole("button", { name: "スタッフを追加" }).click();
    await expect(
      this.page.getByRole("dialog", { name: "スタッフを追加" }),
    ).toBeVisible();

    const form = this.page.locator("[id='add-staff-form']");
    const nameInputs = form.getByPlaceholder("例: 田中 花子");
    const emailInputs = form.getByPlaceholder("例: hanako@example.com");

    for (let i = 0; i < entries.length; i++) {
      await nameInputs.nth(i).fill(entries[i].name);
      await emailInputs.nth(i).fill(entries[i].email);
    }

    // 余剰行を削除（フォームの初期行数 > 入力数の場合）
    const deleteButtons = this.page
      .getByRole("dialog")
      .getByRole("button", { name: "削除" });
    while ((await deleteButtons.count()) > entries.length) {
      await deleteButtons.last().click();
    }

    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: "登録する" })
      .click();
    await expect(this.page.getByText("スタッフを追加しました")).toBeVisible();
  }

  async createRecruitment(data: {
    periodStart: string;
    periodEnd: string;
    deadline: string;
  }) {
    await this.page.getByRole("button", { name: "新しい募集を作成" }).click();
    await expect(
      this.page.getByRole("dialog", { name: "新しい募集を作成" }),
    ).toBeVisible();

    const form = this.page.locator("[id='create-recruitment-form']");
    const dateInputs = form.locator("input[type='date']");
    await dateInputs.nth(0).fill(data.periodStart);
    await dateInputs.nth(1).fill(data.periodEnd);
    await dateInputs.nth(2).fill(data.deadline);

    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: "作成する" })
      .click();
    await expect(this.page.getByText("募集を作成しました")).toBeVisible();
  }

  async openShiftBoard() {
    await this.page.getByRole("button", { name: "シフトボードを開く" }).click();
    await this.page.waitForURL(/\/shiftboard\//);
  }

  async expectStaffSectionVisible() {
    await expect(
      this.page.getByRole("heading", { name: "スタッフ", exact: true }),
    ).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async expectRecruitmentCardVisible() {
    await expect(
      this.page.getByRole("button", { name: "シフトボードを開く" }),
    ).toBeVisible();
  }

  // 同名オプションが複数Select間で重複するため、listbox にスコープして選択
  private async selectTime(label: string, value: string) {
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page.getByRole("listbox", { name: label }).getByRole("option", { name: value, exact: true }).click();
  }
}

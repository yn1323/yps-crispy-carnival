import { expect, type Locator, type Page } from "@playwright/test";

export class StaffViewPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/shifts/view?token=${token}`);
  }

  async expectShiftViewVisible() {
    await expect(this.page.getByText(/シフト/).first()).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectShiftTimeVisible() {
    await expect(this.page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible();
  }

  async expectStaffShiftTime(staffName: string, startTime: string, endTime: string) {
    await expect(this.staffRow(staffName).getByText(`${startTime}–${endTime}`, { exact: true })).toBeVisible();
  }

  async expectStaffHasNoShiftTime(staffName: string) {
    await expect(this.staffRow(staffName).getByText(/\d{1,2}:\d{2}–\d{1,2}:\d{2}/)).toHaveCount(0);
  }

  async expectDateOnlyAssignment(staffName: string, dateLabel: string, assigned: boolean) {
    await expect(
      this.page.getByRole("button", {
        name: `${staffName} ${dateLabel} ${assigned ? "勤務あり" : "勤務なし"}`,
      }),
    ).toBeVisible();
  }

  async switchDateTab(index: number) {
    await this.page.getByRole("tablist", { name: "日付選択" }).getByRole("tab").nth(index).click();
  }

  async expectShiftTypeAssignment(staffName: string, optionName: string, assigned: boolean) {
    await expect(
      this.page.getByRole("button", {
        name: `${staffName} ${optionName} ${assigned ? "勤務あり" : "勤務なし"}`,
      }),
    ).toBeVisible();
  }

  async expectExpiredVisible() {
    await expect(this.page.getByText("このリンクではシフトを確認できません")).toBeVisible();
  }

  async requestReissue(email: string) {
    await this.page.getByRole("link", { name: "新しい閲覧リンクを申し込む" }).click();
    await expect(this.page).toHaveURL(/\/shifts\/reissue/);
    await this.page.getByLabel("メールアドレス").fill(email);
    await this.page.getByRole("button", { name: "再発行を申し込む" }).click();
    await expect(this.page.getByText("再発行を受け付けました").first()).toBeVisible();
  }

  private staffRow(staffName: string): Locator {
    return this.page.locator("[data-tour^='shift-row-']").filter({ hasText: staffName }).first();
  }
}

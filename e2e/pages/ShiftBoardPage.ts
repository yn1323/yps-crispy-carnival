import { expect, type Page } from "@playwright/test";

export class ShiftBoardPage {
  constructor(private page: Page) {}

  async expectOnShiftBoard() {
    await expect(this.page).toHaveURL(/\/shiftboard\//);
  }

  async expectStaffVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectShiftBarVisible() {
    // シフトバーは時刻テキスト（例: "10:00"）を含む要素で確認
    await expect(this.page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible();
  }

  async switchDateTab(index: number) {
    await this.page.getByRole("tablist", { name: "日付選択" }).getByRole("tab").nth(index).click();
  }

  async switchToOverview() {
    await this.page.getByRole("tablist", { name: "ビュー切替" }).getByRole("tab", { name: "一覧" }).first().click();
  }

  async confirm(staffCount: number) {
    await this.page.getByRole("button", { name: "確定して通知する" }).click();

    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`対象: ${staffCount}名`)).toBeVisible();

    await dialog.getByRole("button", { name: "確定して通知する" }).click();

    await expect(this.page.getByText("確定しました")).toBeVisible();
  }

  async expectConfirmedStatus() {
    await expect(this.page.getByText(/確定済み/).first()).toBeVisible();
  }

  async expectResendButton() {
    await expect(this.page.getByRole("button", { name: "再通知する" })).toBeVisible();
  }

  async sendReminders(staffCount: number) {
    await this.page.getByRole("button", { name: "催促" }).click();

    const dialog = this.page.getByRole("dialog", { name: "未提出者に催促通知を送信" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`未提出 ${staffCount}名`)).toBeVisible();

    await dialog.getByRole("button", { name: "送信する" }).click();
    await expect(this.page.getByText("催促通知を送信しました")).toBeVisible();
  }

  async expectNoUnsubmittedReminder() {
    await expect(this.page.getByText(/未提出 \d+人/)).not.toBeVisible();
  }

  async expectOverviewStaffTimeCount(staffName: string, count: number) {
    await this.switchToOverview();
    const row = this.page.getByRole("row").filter({ hasText: staffName }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/\d{1,2}:\d{2}.*\d{1,2}:\d{2}/)).toHaveCount(count);
  }

  async expectOverviewStaffHasTime(staffName: string) {
    await this.switchToOverview();
    const row = this.page.getByRole("row").filter({ hasText: staffName }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/\d{1,2}:\d{2}.*\d{1,2}:\d{2}/).first()).toBeVisible();
  }
}

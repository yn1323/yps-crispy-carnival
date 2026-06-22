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

  async expectShiftTypeOptionVisible(optionName: string) {
    await expect(this.page.getByText(optionName, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }

  async expectShiftTypeTimeVisible(timeRange: string) {
    await expect(this.page.getByText(timeRange, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }

  async switchDateTab(index: number) {
    await this.page.getByRole("tablist", { name: "日付選択" }).getByRole("tab").nth(index).click();
  }

  async switchToOverview() {
    await this.page.getByRole("tab", { name: "一覧" }).first().click();
  }

  async confirm(staffCount: number) {
    await this.page.getByRole("button", { name: /確定して通知する|シフトを確定して通知/ }).click();

    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // 実配送はdry-run/クライアント単体テスト側に寄せ、E2Eでは確認対象人数と成功トーストまでを見る。
    await expect(dialog.getByText(`対象: ${staffCount}名`)).toBeVisible();

    await dialog.getByRole("button", { name: /確定して通知する|シフトを確定して通知/ }).click();

    await expect(this.page.getByText("確定しました")).toBeVisible();
  }

  async expectConfirmedStatus() {
    await expect(this.page.getByText(/確定済み/).first()).toBeVisible();
  }

  async expectResendButton() {
    await expect(this.page.getByRole("button", { name: /再通知する|もう一度通知/ })).toBeVisible();
  }

  async expectAutomaticReminderInfo() {
    await expect(
      this.page
        .getByText(
          /締切前日17:00に自動で催促通知を送ります。|提出締切の前日17:00に未提出者へ自動で催促します|自動催促は設定されていません|自動催促の送信予定はありません/,
        )
        .first(),
    ).toBeVisible();
    await expect(this.page.getByRole("button", { name: /催促を送る|催促通知を送る/ })).not.toBeVisible();
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

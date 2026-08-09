import { expect, type Page } from "@playwright/test";

export class ShiftBoardPage {
  constructor(private page: Page) {}

  async expectOverviewStaffTimeCount(staffName: string, count: number) {
    await this.page.getByRole("tab", { name: "一覧" }).first().click();
    const row = this.page.getByRole("row").filter({ hasText: staffName }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/\d{1,2}:\d{2}.*\d{1,2}:\d{2}/)).toHaveCount(count);
  }

  async confirm(staffCount: number) {
    await this.page.getByRole("button", { name: /確定して通知する|シフトを確定して通知/ }).click();
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`対象：${staffCount}名`)).toBeVisible();
    await dialog.getByRole("button", { name: /確定して通知する|シフトを確定して通知/ }).click();
    await expect(this.page.getByText("シフトを確定しました")).toBeVisible();
  }

  async expectConfirmedStatus() {
    await expect(this.page.getByText(/確定済み/).first()).toBeVisible();
  }
}

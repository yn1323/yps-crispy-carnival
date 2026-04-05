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
    const tabs = this.page.getByRole("tab");
    await tabs.nth(index).click();
  }

  async switchToOverview() {
    // PC/SPで2つのSegmentGroupが存在するためlabelテキストをクリック
    await this.page.locator("[data-scope='segment-group'] [data-part='item-text']").getByText("一覧").first().click();
  }

  async save() {
    await this.page.getByRole("button", { name: "保存" }).click();
    await expect(this.page.getByText("保存しました")).toBeVisible();
  }

  async confirm(staffCount: number) {
    await this.page.getByRole("button", { name: "スタッフに送信する" }).click();

    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`対象: ${staffCount}名`)).toBeVisible();

    await dialog.getByRole("button", { name: "送信する" }).click();

    await expect(this.page.getByText("送信しました")).toBeVisible();
  }

  async expectConfirmedStatus() {
    await expect(this.page.getByText(/送信済み/)).toBeVisible();
  }

  async expectResendButton() {
    await expect(this.page.getByRole("button", { name: "再送信する" })).toBeVisible();
  }
}

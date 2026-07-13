import { expect, type Locator, type Page } from "@playwright/test";

export class NotificationFailureDialogPage {
  constructor(private page: Page) {}

  private dialog(): Locator {
    return this.page.getByRole("dialog", { name: "送れなかった通知" });
  }

  async open() {
    await expect(this.page.getByText("送れなかった通知があります")).toBeVisible();
    await this.page.getByRole("button", { name: "通知を確認" }).click();
    await expect(this.dialog()).toBeVisible();
  }

  async expectFailureVisible(staffName: string) {
    await expect(this.dialog().getByRole("row").filter({ hasText: staffName })).toBeVisible();
  }

  async resend(staffName: string) {
    const row = this.dialog().getByRole("row").filter({ hasText: staffName });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "再送", exact: true }).click();
    await expect(this.page.getByText("通知を再送しました")).toBeVisible();
    await expect(row.getByRole("button", { name: "再送済み" })).toBeVisible();
  }

  async resendAll() {
    await this.dialog().getByRole("button", { name: "すべて再送" }).click();
    await expect(this.page.getByText(/送れなかった通知を再送しました|一部の通知を再送しました/)).toBeVisible();
  }

  async expectAllAccepted() {
    await expect(this.dialog().getByRole("button", { name: "再送済み" })).toHaveCount(2);
    await expect(this.dialog().getByRole("button", { name: "すべて再送" })).toBeDisabled();
  }
}

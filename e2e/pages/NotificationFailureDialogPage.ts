import { expect, type Locator, type Page } from "@playwright/test";

const DASHBOARD_DATA_TIMEOUT = 20_000;

export class NotificationFailureDialogPage {
  constructor(private page: Page) {}

  private dialog(): Locator {
    return this.page.getByRole("dialog", { name: "送れなかった通知" });
  }

  private failureRow(staffName: string): Locator {
    return this.dialog()
      .getByRole("row")
      .filter({
        has: this.page.getByRole("cell", { name: staffName, exact: true }),
      });
  }

  async open() {
    const openButton = this.page.getByRole("button", { name: "通知を確認" });
    await expect(openButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await openButton.click();
    await expect(this.dialog()).toBeVisible();
  }

  async expectFailureVisible(staffName: string) {
    await expect(this.failureRow(staffName)).toBeVisible();
  }

  async resend(staffName: string) {
    const row = this.failureRow(staffName);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "再送", exact: true }).click();
    await expect(this.page.getByText("通知を再送しました")).toBeVisible();
    await expect(row.getByRole("button", { name: "再送済み" })).toBeVisible();
  }

  async resendAll() {
    await this.dialog().getByRole("button", { name: "すべて再送" }).click();
    await expect(this.page.getByText(/送れなかった通知を再送しました|一部の通知を再送しました/)).toBeVisible();
  }

  async markAsNoActionRequired(staffName: string) {
    const row = this.failureRow(staffName);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "対応不要" }).click();

    const confirmation = this.page.getByRole("alertdialog", {
      name: "送れなかった通知を対応不要にする",
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByText("対応不要にすると一覧から削除され、再送されません。")).toBeVisible();
    await confirmation.getByRole("button", { name: "対応不要にする" }).click();

    await expect(this.page.getByText("送れなかった通知を対応不要にしました")).toBeVisible();
    await expect(row).not.toBeVisible();
  }

  async expectAcceptedCount(count: number) {
    await expect(this.dialog().getByRole("button", { name: "再送済み" })).toHaveCount(count);
    await expect(this.dialog().getByRole("button", { name: "すべて再送" })).toBeDisabled();
  }
}

import { expect, type Locator, type Page } from "@playwright/test";

export class StaffViewPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    try {
      await this.page.goto(`/shifts/view?token=${token}`, { waitUntil: "domcontentloaded" });
    } catch {
      throw new Error("E2E capability navigation failed: staff-view");
    }
  }

  async expectShiftViewVisible() {
    await expect(this.page.getByText(/のシフト$/, { exact: true })).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.staffRow(name)).toBeVisible();
  }

  async expectShiftTimeVisible() {
    await expect(
      this.staffRows()
        .getByText(/\d{1,2}:\d{2}/)
        .first(),
    ).toBeVisible();
  }

  private staffRow(staffName: string): Locator {
    return this.staffRows().filter({ hasText: staffName }).first();
  }

  private staffRows() {
    return this.page.locator("[data-tour^='shift-row-']");
  }
}

import { expect, type Locator, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const STAFF_VIEW_DATA_TIMEOUT = 20_000;

export class StaffViewPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    try {
      await this.page.goto(`/shifts/view?token=${token}`, { waitUntil: "domcontentloaded" });
      await expectAppHydrated(this.page);
    } catch {
      throw new Error("E2E capability navigation failed: staff-view");
    }
  }

  async expectShiftViewVisible() {
    await expect(this.page.getByText(/のシフト$/, { exact: true })).toBeVisible({ timeout: STAFF_VIEW_DATA_TIMEOUT });
  }

  async expectStaffVisible(name: string) {
    await expect(this.staffRow(name)).toBeVisible({ timeout: STAFF_VIEW_DATA_TIMEOUT });
  }

  async expectShiftTimeVisible() {
    await expect(
      this.staffRows()
        .getByText(/\d{1,2}:\d{2}/)
        .first(),
    ).toBeVisible({ timeout: STAFF_VIEW_DATA_TIMEOUT });
  }

  /** スマートフォンの時間指定の日別で、スタッフの勤務が休憩の時刻を内訳に出すことを確認する。 */
  async expectStaffBreakVisible(name: string, breakLabel: string) {
    const row = this.staffRow(name);
    await expect(row.getByText("休憩", { exact: true })).toBeVisible({ timeout: STAFF_VIEW_DATA_TIMEOUT });
    await expect(row.getByText(breakLabel, { exact: true })).toBeVisible();
  }

  private staffRow(staffName: string): Locator {
    return this.staffRows().filter({ hasText: staffName }).first();
  }

  private staffRows() {
    return this.page.locator("[data-tour^='shift-row-']");
  }
}

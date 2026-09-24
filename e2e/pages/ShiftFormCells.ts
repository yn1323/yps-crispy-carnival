import { expect, type Page } from "@playwright/test";

const SHIFT_FORM_DATA_TIMEOUT = 20_000;

/** 管理者のシフト表と、スタッフの確定シフト閲覧が共有するShiftFormのセル操作。 */
export class ShiftFormCells {
  constructor(private page: Page) {}

  async expectDateOnlyAssignment(staffName: string, dateLabel: string, assigned: boolean) {
    await expect(this.dateOnlyCell(staffName, dateLabel, assigned)).toBeVisible({
      timeout: SHIFT_FORM_DATA_TIMEOUT,
    });
  }

  async expectDateOnlyStaffAbsent(staffName: string, dateLabel: string) {
    await expect(this.dateOnlyCell(staffName, dateLabel, true)).toHaveCount(0);
    await expect(this.dateOnlyCell(staffName, dateLabel, false)).toHaveCount(0);
  }

  async toggleDateOnlyAssignment(staffName: string, dateLabel: string, currentlyAssigned: boolean) {
    await this.dateOnlyCell(staffName, dateLabel, currentlyAssigned).click();
    await this.expectDateOnlyAssignment(staffName, dateLabel, !currentlyAssigned);
  }

  async selectDailyDate(isoDate: string) {
    const chip = this.page.getByRole("tablist", { name: "日付選択" }).locator(`[data-date-chip="${isoDate}"]`);
    await expect(chip).toBeVisible({ timeout: SHIFT_FORM_DATA_TIMEOUT });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-selected", "true");
  }

  async expectShiftTypeAssignment(staffName: string, optionName: string, assigned: boolean) {
    await expect(this.shiftTypeCell(staffName, optionName, assigned)).toBeVisible({
      timeout: SHIFT_FORM_DATA_TIMEOUT,
    });
  }

  async toggleShiftTypeAssignment(staffName: string, optionName: string, currentlyAssigned: boolean) {
    await this.shiftTypeCell(staffName, optionName, currentlyAssigned).click();
    await this.expectShiftTypeAssignment(staffName, optionName, !currentlyAssigned);
  }

  private dateOnlyCell(staffName: string, dateLabel: string, assigned: boolean) {
    return this.page.getByRole("button", {
      name: `${staffName} ${dateLabel} ${assigned ? "勤務あり" : "勤務なし"}`,
      exact: true,
    });
  }

  private shiftTypeCell(staffName: string, optionName: string, assigned: boolean) {
    return this.page.getByRole("button", {
      name: `${staffName} ${optionName} ${assigned ? "勤務あり" : "勤務なし"}`,
      exact: true,
    });
  }
}

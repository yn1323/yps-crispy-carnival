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

  /** くわしく表示の「入れるもの」で、これから入れるポジションを選ぶ。 */
  async selectPositionTool(positionName: string) {
    const tool = this.page
      .getByRole("radiogroup", { name: "入れるもの", exact: true })
      .getByRole("radio", { name: positionName, exact: true });
    await expect(tool).toBeVisible({ timeout: SHIFT_FORM_DATA_TIMEOUT });
    await tool.click();
    await expect(tool).toHaveAttribute("aria-checked", "true");
  }

  /** 日付選択の週表で、勤務のない日へ選んでいるポジションの勤務を入れる。 */
  async assignDateOnlyWithPosition(staffName: string, dateLabel: string, positionName: string) {
    await this.dateOnlyCell(staffName, dateLabel, false).click();
    await this.expectDateOnlyPosition(staffName, dateLabel, positionName);
  }

  async expectDateOnlyPosition(staffName: string, dateLabel: string, positionName: string) {
    await expect(
      this.page.getByRole("button", { name: `${staffName} ${dateLabel} 勤務あり、${positionName}`, exact: true }),
    ).toBeVisible({ timeout: SHIFT_FORM_DATA_TIMEOUT });
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

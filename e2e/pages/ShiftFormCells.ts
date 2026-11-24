import { expect, type Page } from "@playwright/test";

const SHIFT_FORM_DATA_TIMEOUT = 20_000;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 管理者のシフト表と、スタッフの確定シフト閲覧が共有するShiftFormのセル操作。 */
export class ShiftFormCells {
  constructor(private page: Page) {}

  async expectDateOnlyAssignment(staffName: string, dateLabel: string, assigned: boolean) {
    await expect(this.dateOnlyCell(staffName, dateLabel, assigned)).toBeVisible({
      timeout: SHIFT_FORM_DATA_TIMEOUT,
    });
  }

  async expectDateOnlyStaffAbsent(staffName: string, dateLabel: string) {
    // 希望のない人は、たたんだまとまりの中にいてDOMにない。開いてから、どこにもいないことを確かめる。
    const foldedGroup = this.page.getByRole("button", { name: /^(希望なし|この日の希望がない人) \d+人/ });
    if ((await foldedGroup.count()) > 0) {
      await foldedGroup.click();
      await expect(foldedGroup).toHaveAttribute("aria-expanded", "true");
    }
    await expect(this.dateOnlyCell(staffName, dateLabel, true)).toHaveCount(0);
    await expect(this.dateOnlyCell(staffName, dateLabel, false)).toHaveCount(0);
  }

  async toggleDateOnlyAssignment(staffName: string, dateLabel: string, currentlyAssigned: boolean) {
    await this.dateOnlyCell(staffName, dateLabel, currentlyAssigned).click();
    await this.expectDateOnlyAssignment(staffName, dateLabel, !currentlyAssigned);
  }

  /**
   * 日付選択の週表で、勤務のない日へ勤務を入れ、開いたメニューでポジションを選ぶ。
   * 空きのセルを押すと、最後に選んだポジション（選んでいなければ先頭のポジション）で入る。
   */
  async assignDateOnlyWithPosition(staffName: string, dateLabel: string, positionName: string) {
    await this.dateOnlyCell(staffName, dateLabel, false).click();
    const assigned = this.page.getByRole("button", {
      name: new RegExp(`^${staffName} ${escapeRegExp(dateLabel)} 勤務あり`),
    });
    await expect(assigned).toBeVisible({ timeout: SHIFT_FORM_DATA_TIMEOUT });
    await assigned.click();
    await this.page.getByRole("menuitemradio", { name: positionName }).click();
    await this.expectDateOnlyPosition(staffName, dateLabel, positionName);
  }

  async expectDateOnlyPosition(staffName: string, dateLabel: string, positionName: string) {
    await expect(
      this.page.getByRole("button", { name: `${staffName} ${dateLabel} 勤務あり、${positionName}`, exact: true }),
    ).toBeVisible({ timeout: SHIFT_FORM_DATA_TIMEOUT });
  }

  /** ポジションを添えた勤務のセルが、確認事項の理由（「担当外のポジション」など）を読み上げに持つことを確認する。 */
  async expectDateOnlyPositionNotice(staffName: string, dateLabel: string, positionName: string, notice: string) {
    await expect(
      this.page.getByRole("button", { name: `${staffName} ${dateLabel} 勤務あり、${positionName}`, exact: true }),
    ).toHaveAccessibleDescription(new RegExp(escapeRegExp(notice)), { timeout: SHIFT_FORM_DATA_TIMEOUT });
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

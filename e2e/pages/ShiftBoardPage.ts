import { expect, type Locator, type Page } from "@playwright/test";

export class ShiftBoardPage {
  constructor(private page: Page) {}

  async expectOnShiftBoard() {
    await expect(this.page).toHaveURL(/\/shiftboard\//);
  }

  async reload() {
    await this.page.reload();
    await this.expectOnShiftBoard();
  }

  async expectStaffVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectStaffNotVisible(name: string) {
    await expect(this.page.getByText(name, { exact: true })).not.toBeVisible();
  }

  async expectShiftBarVisible() {
    // シフトバーは時刻テキスト（例: "10:00"）を含む要素で確認
    await expect(this.page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible();
  }

  async assignShift(staffName: string, assignment: { startTime: string; endTime: string }) {
    const row = this.staffRow(staffName);
    await expect(row).toBeVisible();

    const [rowBox, startTickBox, endTickBox] = await Promise.all([
      row.boundingBox(),
      this.visibleTimeTick(assignment.startTime).boundingBox(),
      this.visibleTimeTick(assignment.endTime).boundingBox(),
    ]);
    if (!rowBox || !startTickBox || !endTickBox) {
      throw new Error(`シフト行の座標を取得できませんでした: ${staffName}`);
    }

    const startX = startTickBox.x + startTickBox.width / 2;
    const endX = endTickBox.x + endTickBox.width / 2;
    const y = rowBox.y + rowBox.height / 2;

    await this.page.mouse.move(startX, y);
    await this.page.mouse.down();
    await this.page.mouse.move(endX, y, { steps: 8 });
    await this.page.mouse.up();

    await this.expectStaffShiftTime(staffName, assignment.startTime, assignment.endTime);
  }

  async saveDraft() {
    await this.page.getByRole("button", { name: "下書き保存" }).click();
    await expect(this.page.getByText("下書きを保存しました")).toBeVisible();
  }

  async reloadAndExpectDraft(staffName: string, startTime: string, endTime: string) {
    await this.page.reload();
    await this.expectOnShiftBoard();
    await this.expectStaffShiftTime(staffName, startTime, endTime);
  }

  async expectStaffShiftTime(staffName: string, startTime: string, endTime: string) {
    await expect(this.staffRow(staffName).getByText(`${startTime}–${endTime}`, { exact: true })).toBeVisible();
  }

  async expectStaffRequestedTime(staffName: string, startTime: string, endTime: string) {
    await expect(this.staffRow(staffName).getByText(`希望：${startTime}-${endTime}`, { exact: true })).toBeVisible();
  }

  async expectStaffRequestedDayOff(staffName: string) {
    await expect(this.staffRow(staffName).getByText("休み希望", { exact: true })).toBeVisible();
  }

  async expectShiftTypeOptionVisible(optionName: string) {
    await expect(this.page.getByText(optionName, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }

  async expectShiftTypeTimeVisible(timeRange: string) {
    await expect(this.page.getByText(timeRange, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  }

  async expectDateOnlyAssignment(staffName: string, dateLabel: string, assigned: boolean) {
    await expect(
      this.page.getByRole("button", {
        name: `${staffName} ${dateLabel} ${assigned ? "勤務あり" : "勤務なし"}`,
      }),
    ).toBeVisible();
  }

  async toggleDateOnlyAssignment(staffName: string, dateLabel: string, assigned: boolean) {
    await this.expectDateOnlyAssignment(staffName, dateLabel, assigned);
    await this.page
      .getByRole("button", {
        name: `${staffName} ${dateLabel} ${assigned ? "勤務あり" : "勤務なし"}`,
      })
      .click();
    await this.expectDateOnlyAssignment(staffName, dateLabel, !assigned);
  }

  async expectShiftTypeAssignment(staffName: string, optionName: string, assigned: boolean) {
    await expect(
      this.page.getByRole("button", {
        name: `${staffName} ${optionName} ${assigned ? "勤務あり" : "勤務なし"}`,
      }),
    ).toBeVisible();
  }

  async toggleShiftTypeAssignment(staffName: string, optionName: string, assigned: boolean) {
    await this.expectShiftTypeAssignment(staffName, optionName, assigned);
    await this.page
      .getByRole("button", {
        name: `${staffName} ${optionName} ${assigned ? "勤務あり" : "勤務なし"}`,
      })
      .click();
    await this.expectShiftTypeAssignment(staffName, optionName, !assigned);
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
    await expect(dialog.getByText(`対象：${staffCount}名`)).toBeVisible();

    await dialog.getByRole("button", { name: /確定して通知する|シフトを確定して通知/ }).click();

    await expect(this.page.getByText("シフトを確定しました")).toBeVisible();
  }

  async replaceShift(
    staffName: string,
    current: { startTime: string; endTime: string },
    next: { startTime: string; endTime: string },
  ) {
    const row = this.staffRow(staffName);
    const currentShiftLabel = row.getByText(`${current.startTime}–${current.endTime}`, { exact: true });
    const labelBox = await currentShiftLabel.boundingBox();
    if (!labelBox) throw new Error(`変更前シフトの座標を取得できませんでした: ${staffName}`);
    // 時刻ラベルの上にシフトバー本体が重なるため、同じ座標をクリックしてバーのpopoverを開く。
    await this.page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    await this.page.getByRole("button", { name: "時間帯を削除" }).click();
    const closePopover = this.page.getByRole("button", { name: "閉じる" });
    if (await closePopover.isVisible()) await closePopover.click();
    await this.assignShift(staffName, next);
  }

  async notifyChangedStaff() {
    await this.page.getByRole("button", { name: /変更があるスタッフに通知|もう一度通知/ }).click();
    const dialog = this.page.getByRole("dialog", { name: "確定済みのシフトをもう一度通知しますか？" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("対象：前回通知から変更があるスタッフ")).toBeVisible();
    await dialog.getByRole("button", { name: "変更があるスタッフに通知" }).click();
    await expect(this.page.getByText("変更があるスタッフに通知を送りました")).toBeVisible();
  }

  async expectConfirmedStatus() {
    await expect(this.page.getByText(/確定済み/).first()).toBeVisible();
  }

  async expectResendButton() {
    await expect(this.page.getByRole("button", { name: /再送|もう一度通知/ })).toBeVisible();
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

  private staffRow(staffName: string): Locator {
    // 勤務時間の編集領域にはrole/nameがないため、既存ツアー用マーカーで行を特定する。
    return this.page.locator("[data-tour^='shift-row-']").filter({ hasText: staffName }).first();
  }

  private visibleTimeTick(time: string): Locator {
    return this.page.getByText(time, { exact: true }).filter({ visible: true }).first();
  }
}

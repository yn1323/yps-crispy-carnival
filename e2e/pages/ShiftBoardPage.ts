import { expect, type Locator, type Page } from "@playwright/test";

export class ShiftBoardPage {
  constructor(private page: Page) {}

  async expectOverviewStaffTimeCount(staffName: string, count: number) {
    await this.page.getByRole("tab", { name: "一覧" }).first().click();
    const row = this.page.getByRole("row").filter({ hasText: staffName }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(/\d{1,2}:\d{2}.*\d{1,2}:\d{2}/)).toHaveCount(count);
  }

  async confirm(staffCount: number) {
    await this.page.getByRole("button", { name: "確定", exact: true }).click();
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`対象：${staffCount}名`)).toBeVisible();
    await dialog.getByRole("button", { name: "確定する", exact: true }).click();
    await expect(this.page.getByText("シフトを確定しました")).toBeVisible();
  }

  async expectConfirmedStatus() {
    await expect(this.page.getByRole("button", { name: /もう一度通知|再送/ })).toBeVisible();
  }

  /** スマートフォンのシフト表は、保存と確定を「保存・確定・出力」メニューへまとめている。 */
  async confirmFromMobileMenu(staffCount: number) {
    await this.page.getByRole("button", { name: "保存・確定・出力", exact: true }).click();
    await this.page.getByRole("menuitem", { name: "シフトを確定", exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "シフトを確定しますか？" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`対象：${staffCount}名`)).toBeVisible();
    await dialog.getByRole("button", { name: "確定する", exact: true }).click();
    await expect(this.page.getByText("シフトを確定しました")).toBeVisible();
    await expect(this.page.getByRole("button", { name: "保存・再送・出力", exact: true })).toBeVisible();
  }

  /** 日付選択の週表で、スタッフの行の連絡事項列に、その日付と提出されたメモが並ぶことを確認する。 */
  async expectDateOnlyNotesForDate(dateText: string, notes: Array<{ staffName: string; note: string }>) {
    // 連絡事項列は曜日を省いた「M/D」で日付を表示する。
    const shortDate = dateText.replace(/\(.\)$/, "");
    for (const { staffName, note } of notes) {
      await expect(
        this.page
          .getByRole("row")
          .filter({ hasText: staffName })
          .getByRole("listitem")
          .filter({ hasText: shortDate })
          .filter({ hasText: note }),
      ).toBeVisible();
    }
  }

  /**
   * くわしく表示の日付の見出しで、ポジションの「配置/必要」がその表示の日数だけ並ぶことを確認する。
   * 見出しの「配置/必要」は、読み上げとtitleに「キッチン 1/2」の形の全文を持つ。
   */
  async expectStaffingCountDays(positionName: string, label: string, dayCount: number) {
    await expect(this.page.getByTitle(`${positionName} ${label}`, { exact: true })).toHaveCount(dayCount, {
      timeout: 20_000,
    });
  }

  /**
   * 日付見出しの「表示設定」で「くわしく」へ切り替える。下書きのない募集では、確認を挟まずに切り替わる。
   * 切り替えが済むとシフト表が開き直されるため、呼び出し側は、くわしく表示にだけ出る要素を待ってから次の操作へ進む。
   */
  async switchToDetailMode() {
    await this.page.getByRole("button", { name: "表示設定", exact: true }).click();
    await this.page.getByRole("menuitemradio", { name: "くわしく", exact: true }).click();
  }

  /**
   * スマートフォンの時間指定の日別で、勤務のない人のカードから編集シートを開き、勤務時間と休憩を入れる。
   * 休憩は「休憩を追加」が入れる初期値（勤務時間の中央の1時間）のまま決定する。
   */
  async addMobileWorkWithBreak(staffName: string, work: { start: string; end: string }) {
    await this.page.getByRole("button", { name: `${staffName}の勤務を追加`, exact: true }).click();
    const sheet = this.page.getByRole("dialog", { name: new RegExp(`^${staffName}のシフト`) });
    await expect(sheet).toBeVisible();
    // くわしく表示の編集シートは、勤務時間を行ごとに持つ。
    await this.selectSheetTime(sheet, "勤務時間1の開始時間", work.start);
    await this.selectSheetTime(sheet, "勤務時間1の終了時間", work.end);
    await sheet.getByRole("button", { name: "休憩を追加", exact: true }).click();
    await expect(sheet.getByRole("group", { name: "休憩1", exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(sheet).toBeHidden();
  }

  /** スマートフォンの時間指定の日別で、勤務のカードが休憩の時刻を内訳に出すことを確認する。 */
  async expectMobileBreak(staffName: string, breakLabel: string) {
    const card = this.page.getByRole("button", { name: `${staffName}の勤務を編集`, exact: true });
    await expect(card.getByText("休憩", { exact: true })).toBeVisible();
    await expect(card.getByText(breakLabel, { exact: true })).toBeVisible();
  }

  private async selectSheetTime(sheet: Locator, label: string, value: string) {
    await sheet.getByRole("combobox", { name: label, exact: true }).click();
    // 直前に選んだ欄の一覧が閉じきる前でも、この欄の一覧の選択肢だけを押す。
    await sheet
      .getByRole("listbox", { name: label, exact: true })
      .getByRole("option", { name: value, exact: true })
      .click();
  }

  /** くわしく表示の未提出の帯から、前回確定した募集の同じ曜日の勤務を、未提出者へ仮で入れる。 */
  async insertPreviousShiftsAsProvisional(insertedDayCount: number) {
    await this.page.getByRole("button", { name: "前回の勤務を仮で入れる", exact: true }).click();
    await expect(
      this.page.getByText(`前回の勤務を${insertedDayCount}日分、仮で入れました`, { exact: true }),
    ).toBeVisible();
  }

  async saveDraft() {
    await this.page.getByRole("button", { name: "下書き保存", exact: true }).click();
    await expect(this.page.getByText("下書きを保存しました", { exact: true })).toBeVisible();
  }

  async notifyChangedStaff() {
    await this.page.getByRole("button", { name: "もう一度通知", exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "確定シフトをもう一度通知しますか？" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("対象：前回通知から変更があるスタッフ", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "通知する", exact: true }).click();
    await expect(this.page.getByText("変更があるスタッフに通知を送りました", { exact: true })).toBeVisible();
  }
}

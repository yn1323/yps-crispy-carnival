import { expect, type Page } from "@playwright/test";

const STAFF_SUBMIT_DATA_TIMEOUT = 20_000;

export class StaffSubmitPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/shifts/submit?token=${token}`);
  }

  async expectFormVisible() {
    await expect(this.page.getByRole("button", { name: /提出|更新/ })).toBeVisible({
      timeout: STAFF_SUBMIT_DATA_TIMEOUT,
    });
  }

  async expectUnsubmittedBadge() {
    await expect(this.page.getByRole("button", { name: /提出する|希望シフトを提出/ })).toBeVisible({
      timeout: STAFF_SUBMIT_DATA_TIMEOUT,
    });
  }

  async expectSubmittedBadge() {
    await expect(this.page.getByRole("button", { name: /修正して提出する|希望シフトを更新/ })).toBeVisible({
      timeout: STAFF_SUBMIT_DATA_TIMEOUT,
    });
  }

  async expectCompletionVisible() {
    await expect(this.page).toHaveURL(/\/shifts\/submit\/completed(?:\?.*)?$/);
    await expect(this.page.getByText("提出が完了しました")).toBeVisible();
  }

  async expectReadOnlyVisible() {
    await expect(this.page.getByText("締切を過ぎたため変更できません")).toBeVisible();
  }

  async expectExpiredVisible() {
    await expect(this.page.getByText(/提出締切を過ぎています|提出締切を過ぎました/)).toBeVisible();
  }

  async expectSubmitButtonNotVisible() {
    await expect(this.page.getByRole("button", { name: /提出|更新/ })).not.toBeVisible();
  }

  async expectLegalConsentVisible() {
    await expect(
      this.page.getByText(/初回の提出時、または利用規約・プライバシーポリシーに大きな変更があった場合のみ/),
    ).toBeVisible();
    await expect(this.legalConsentCheckbox()).toBeVisible();
  }

  async expectLegalConsentNotVisible() {
    await expect(
      this.page.getByText(/初回の提出時、または利用規約・プライバシーポリシーに大きな変更があった場合のみ/),
    ).not.toBeVisible();
    await expect(this.legalConsentCheckbox()).not.toBeVisible();
  }

  async acceptLegalConsent() {
    await this.page.locator("[data-scope='checkbox'][data-part='control']").click();
  }

  async toggleDay(dateText: string) {
    // 日付カード全体がトグル操作の対象。テキストから親へ上がり、表示文言変更にPOMを追随させる。
    const dateEl = this.page.getByText(dateText, { exact: true });
    await dateEl.locator("..").click();
  }

  async clearDay(dateText: string) {
    // 休み戻しボタンは同じ日付行に閉じて探す。別日の同名ボタンを押さないためのスコープ。
    await this.page
      .getByText(dateText, { exact: true })
      .locator("..")
      .getByRole("button", { name: "休みに戻す" })
      .click();
  }

  async submit() {
    await this.page.getByRole("button", { name: /提出|更新/ }).click();
  }

  async expectLateInitialConfirmVisible() {
    const dialog = this.page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "提出締切を過ぎています" })).toBeVisible();
    await expect(
      dialog.getByText(
        "提出締切を過ぎています。提出後はこのリンクから変更できません。変更が必要な場合はシフト作成担当者に連絡してください。",
      ),
    ).toBeVisible();
  }

  async confirmLateInitialSubmit() {
    await this.page.getByRole("dialog").getByRole("button", { name: "この内容で提出する" }).click();
  }

  async expectDayWorking(dateText: string) {
    const row = this.page.getByText(dateText, { exact: true }).locator("..");
    await expect(row.getByText("〜")).toBeVisible();
  }

  async expectDateWorking(dateText: string) {
    const row = this.dateRow(dateText);
    await expect(row.getByText("出勤希望")).toBeVisible();
  }

  async expectDayOff(dateText: string) {
    const row = this.dateRow(dateText);
    await expect(row.getByText("休み")).toBeVisible();
  }

  async expectShopClosed(dateText: string) {
    const row = this.dateRow(dateText);
    await expect(row.getByText("定休日")).toBeVisible();
  }

  async selectShiftTypeDay(dateText: string) {
    await this.page.getByRole("button", { name: `${dateText}を出勤希望にする` }).click();
  }

  async toggleShiftTypeOption(dateText: string, optionName: string) {
    await this.page.getByLabel(`${dateText}の${optionName} 未選択`).click();
  }

  async expectShiftTypeOptionSelected(dateText: string, optionName: string) {
    await expect(this.page.getByLabel(`${dateText}の${optionName} 選択済み`)).toBeVisible();
  }

  private dateRow(dateText: string) {
    return this.page.getByText(dateText, { exact: true }).locator("..");
  }

  private legalConsentCheckbox() {
    return this.page.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー/ });
  }
}

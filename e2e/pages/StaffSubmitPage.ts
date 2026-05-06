import { expect, type Page } from "@playwright/test";

export class StaffSubmitPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/shifts/submit?token=${token}`);
  }

  async expectFormVisible() {
    await expect(this.page.getByRole("button", { name: /提出|更新/ })).toBeVisible();
  }

  async expectUnsubmittedBadge() {
    await expect(this.page.getByRole("button", { name: /提出する|希望シフトを提出/ })).toBeVisible();
  }

  async expectSubmittedBadge() {
    await expect(this.page.getByRole("button", { name: /修正して提出する|希望シフトを更新/ })).toBeVisible();
  }

  async expectCompletionVisible() {
    await expect(this.page).toHaveURL(/\/shifts\/submit\/completed$/);
    await expect(this.page.getByText("提出が完了しました")).toBeVisible();
  }

  async expectReadOnlyVisible() {
    await expect(this.page.getByText("提出締切を過ぎたため変更できません")).toBeVisible();
  }

  async expectExpiredVisible() {
    await expect(this.page.getByText(/提出締切を過ぎています|提出締切を過ぎました/)).toBeVisible();
  }

  async expectSubmitButtonNotVisible() {
    await expect(this.page.getByRole("button", { name: /提出|更新/ })).not.toBeVisible();
  }

  async toggleDay(dateText: string) {
    const dateEl = this.page.getByText(dateText, { exact: true });
    await dateEl.locator("..").click();
  }

  async clearDay(dateText: string) {
    await this.page
      .getByText(dateText, { exact: true })
      .locator("..")
      .getByRole("button", { name: "休みに戻す" })
      .click();
  }

  async submit() {
    await this.page.getByRole("button", { name: /提出|更新/ }).click();
  }

  async expectDayWorking(dateText: string) {
    const row = this.page.getByText(dateText, { exact: true }).locator("..");
    await expect(row.getByText("〜")).toBeVisible();
  }

  async expectDayOff(dateText: string) {
    const row = this.page.getByText(dateText, { exact: true }).locator("..");
    await expect(row.getByText("休み")).toBeVisible();
  }
}

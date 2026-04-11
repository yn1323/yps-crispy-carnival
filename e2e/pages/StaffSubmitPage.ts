import { expect, type Page } from "@playwright/test";

export class StaffSubmitPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/shifts/submit?token=${token}`);
  }

  async expectFormVisible() {
    await expect(this.page.getByText("出勤する日をタップしてください")).toBeVisible();
  }

  async expectUnsubmittedBadge() {
    await expect(this.page.getByText("未提出")).toBeVisible();
  }

  async expectSubmittedBadge() {
    await expect(this.page.getByText("提出済み")).toBeVisible();
  }

  async expectCompletionVisible() {
    await expect(this.page.getByText("提出しました")).toBeVisible();
  }

  async expectReadOnlyVisible() {
    await expect(this.page.getByText("提出締切を過ぎたため変更できません")).toBeVisible();
  }

  async expectExpiredVisible() {
    await expect(this.page.getByText("提出締切を過ぎています")).toBeVisible();
  }

  async expectSubmitButtonNotVisible() {
    await expect(this.page.getByRole("button", { name: /提出する/ })).not.toBeVisible();
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
    await this.page.getByRole("button", { name: /提出する/ }).click();
  }

  async clickEdit() {
    await this.page.getByRole("button", { name: "内容を修正する" }).click();
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

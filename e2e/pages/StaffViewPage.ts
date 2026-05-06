import { expect, type Page } from "@playwright/test";

export class StaffViewPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/shifts/view?token=${token}`);
  }

  async expectShiftViewVisible() {
    await expect(this.page.getByText(/シフト/).first()).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectShiftTimeVisible() {
    await expect(this.page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible();
  }

  async expectExpiredVisible() {
    await expect(this.page.getByText(/このリンクの有効期限が/)).toBeVisible();
  }

  async requestReissue(email: string) {
    await this.page.getByRole("link", { name: "リンクを再発行する" }).click();
    await expect(this.page).toHaveURL(/\/shifts\/reissue/);
    await this.page.getByLabel("メールアドレス").fill(email);
    await this.page.getByRole("button", { name: "リンクを送信する" }).click();
    await expect(this.page.getByText("新しい閲覧リンクをお送りしました")).toBeVisible();
  }
}

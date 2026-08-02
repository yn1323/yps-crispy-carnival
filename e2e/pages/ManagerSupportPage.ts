import { expect, type Page } from "@playwright/test";

const DASHBOARD_DATA_TIMEOUT = 20_000;

export class ManagerSupportPage {
  constructor(private page: Page) {}

  async expectOnboardingVisible(progressLabel: "1/4" | "2/4" | "3/4" | "4/4") {
    const section = this.page.getByRole("region", { name: "シフトリへようこそ！" });
    await expect(section).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(section.getByText(progressLabel, { exact: true })).toBeVisible();
  }

  async dismissOnboarding() {
    await this.page.getByRole("button", { name: "シフトリへようこそを閉じる" }).click();
    await this.expectOnboardingHidden();
  }

  async expectOnboardingHidden() {
    await expect(this.page.getByRole("region", { name: "シフトリへようこそ！" })).not.toBeVisible();
  }

  async submitFeatureRequest(comment: string) {
    await this.page.getByRole("button", { name: "要望を送る" }).click();
    const dialog = this.page.getByRole("dialog", { name: "要望を送る" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("どんな機能や改善があるとうれしいですか？").fill(comment);
    await dialog.getByRole("button", { name: "要望を送る" }).click();
    await expect(this.page.getByText(/要望を送信しました。\s*ご協力ありがとうございます！/)).toBeVisible();
    await expect(dialog).not.toBeVisible();
  }

  async logout() {
    await this.page.getByRole("button", { name: "ユーザーメニュー" }).click();
    await this.page.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(this.page).toHaveURL(/\/$/, { timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(this.page.getByRole("link", { name: "ログイン" }).first()).toBeVisible();
  }

  async revisitProtectedDashboardAfterLogout() {
    await this.page.goto("/dashboard");
    await expect(this.page).toHaveURL(/\/login\?redirect=%2Fdashboard$/, { timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(this.page.getByRole("heading", { name: "シフトリにログイン" })).toBeVisible();
  }
}

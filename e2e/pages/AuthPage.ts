import { expect, type Page } from "@playwright/test";

type AuthPath = "/login";

export class AuthPage {
  constructor(private page: Page) {}

  async expectLoginVisible() {
    await expect(this.page.getByRole("heading", { name: "シフトリにログイン" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    await expect(this.page.getByLabel("メールアドレス")).toBeVisible();
    await expect(this.passwordInput()).toBeVisible();
  }

  async expectCurrentAuthPath(path: AuthPath, redirect?: string) {
    await expect.poll(() => new URL(this.page.url()).pathname).toBe(path);
    await expect.poll(() => new URL(this.page.url()).searchParams.get("redirect")).toBe(redirect ?? null);
  }

  async expectProtectedDashboardHidden() {
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).not.toBeVisible();
    await expect(this.page.getByRole("button", { name: "ユーザーメニュー" })).not.toBeVisible();
  }

  private passwordInput() {
    return this.page.locator("input[name='password']");
  }
}

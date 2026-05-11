import { expect, type Page } from "@playwright/test";

type AuthPath = "/login" | "/signup" | "/forgot-password";

export class AuthPage {
  constructor(private page: Page) {}

  async gotoLogin(redirect?: string) {
    await this.gotoAuthPath("/login", redirect);
  }

  async gotoSignup(redirect?: string) {
    await this.gotoAuthPath("/signup", redirect);
  }

  async gotoForgotPassword(redirect?: string) {
    await this.gotoAuthPath("/forgot-password", redirect);
  }

  async expectLoginVisible() {
    await expect(this.page.getByRole("heading", { name: "シフトリにログイン" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
    await expect(this.page.getByLabel("メールアドレス")).toBeVisible();
    await expect(this.passwordInput()).toBeVisible();
  }

  async expectSignupVisible() {
    await expect(this.page.getByRole("heading", { name: "シフトリをはじめる" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Googleで登録" })).toBeVisible();
    await expect(this.page.getByLabel("メールアドレス")).toBeVisible();
    await expect(this.passwordInput()).toBeVisible();
  }

  async expectForgotPasswordVisible() {
    await expect(this.page.getByRole("heading", { name: "パスワードを再設定" })).toBeVisible();
    await expect(this.page.getByLabel("メールアドレス")).toBeVisible();
    await expect(this.page.getByRole("button", { name: "再設定コードを送る" })).toBeVisible();
  }

  async expectCurrentAuthPath(path: AuthPath, redirect?: string) {
    await expect.poll(() => new URL(this.page.url()).pathname).toBe(path);
    await expect.poll(() => new URL(this.page.url()).searchParams.get("redirect")).toBe(redirect ?? null);
  }

  async goToSignupFromLogin() {
    await this.page.getByRole("link", { name: "新規登録" }).click();
  }

  async goToLoginFromSignup() {
    await this.page.getByRole("link", { name: "ログイン" }).click();
  }

  async goToForgotPasswordFromLogin() {
    await this.page.getByRole("link", { name: "パスワードを忘れた方" }).click();
  }

  async goToLoginFromForgotPassword() {
    await this.page.getByRole("link", { name: "ログインに戻る" }).click();
  }

  async loginWithEmailPassword(email: string, password: string) {
    await this.page.getByLabel("メールアドレス").fill(email);
    await this.passwordInput().fill(password);
    await this.page.getByRole("button", { name: "ログイン", exact: true }).click();
  }

  private async gotoAuthPath(path: AuthPath, redirect?: string) {
    const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    await this.page.goto(`${path}${query}`);
  }

  private passwordInput() {
    return this.page.locator("input[name='password']");
  }
}

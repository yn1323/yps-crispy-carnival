import { expect, type Page } from "@playwright/test";

const INVITATION_TIMEOUT = 20_000;

export class ManagerInvitationPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/manager-invite?token=${encodeURIComponent(token)}`);
  }

  async acceptAndExpectDashboard(token: string, shopId: string) {
    await this.goto(token);
    await expect(this.page).toHaveURL(new RegExp(`/dashboard\\?shop=${escapeRegExp(shopId)}(?:&|$)`), {
      timeout: INVITATION_TIMEOUT,
    });
  }

  async expectEmailMismatch(token: string) {
    await this.goto(token);
    await expect(
      this.page.getByRole("heading", { name: "ログイン中のメールアドレスが招待先と一致しません" }),
    ).toBeVisible({ timeout: INVITATION_TIMEOUT });
    await expect(this.page.getByRole("button", { name: "別のアカウントでログイン" })).toBeVisible();
  }

  async expectUsed(token: string) {
    await this.goto(token);
    await expect(this.page.getByRole("heading", { name: "この招待への参加は完了しています" })).toBeVisible({
      timeout: INVITATION_TIMEOUT,
    });
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { expect, type Page } from "@playwright/test";

export class StaffLegalConsentPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/legal/staff/consent?token=${token}`);
  }

  async expectConsentFormVisible() {
    await expect(this.page.getByRole("heading", { name: "利用規約・プライバシーポリシーの確認" })).toBeVisible();
    await expect(this.legalConsentCheckbox()).toBeVisible();
  }

  async accept() {
    await this.page.locator("[data-scope='checkbox'][data-part='control']").click();
    await this.page.getByRole("button", { name: "同意する" }).click();
  }

  async expectAcceptedVisible() {
    await expect(this.page.getByText("同意済みです")).toBeVisible();
  }

  private legalConsentCheckbox() {
    return this.page.getByRole("checkbox", { name: /利用規約.*プライバシーポリシー/ });
  }
}

import { expect, type Page } from "@playwright/test";

export class StaffRegistrationPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/staff/register?token=${token}`);
  }

  async expectShopName(shopName: string) {
    await expect(this.page.getByText(shopName, { exact: true }).first()).toBeVisible();
  }

  async submitRequest(data: { name: string; email: string }) {
    await this.fillRequestForm(data);
    await this.page.getByRole("button", { name: "申請する" }).click();

    await expect(this.page.getByRole("heading", { name: "スタッフ登録申請を受け付けました" })).toBeVisible();
  }

  private async fillRequestForm(data: { name: string; email: string }) {
    await expect(this.page.getByRole("heading", { name: "スタッフ登録" })).toBeVisible();
    await this.page.getByLabel("名前").fill(data.name);
    await this.page.getByLabel("メールアドレス").fill(data.email);
    await this.page.locator("[data-scope='checkbox'][data-part='control']").click();
    await this.page.getByRole("button", { name: "確認へ" }).click();

    await expect(this.page.getByRole("heading", { name: "申請内容を確認してください" })).toBeVisible();
    await expect(this.page.getByText(data.name)).toBeVisible();
    await expect(this.page.getByText(data.email)).toBeVisible();
  }
}

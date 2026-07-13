import { expect, type Page } from "@playwright/test";

type PublicPath =
  | "/"
  | "/features"
  | "/howto"
  | "/faq"
  | "/articles"
  | "/terms"
  | "/terms/staff"
  | "/privacy"
  | "/privacy/staff"
  | "/contact";

export class PublicSitePage {
  constructor(private page: Page) {}

  async goto(path: PublicPath) {
    await this.page.goto(path);
  }

  async expectHeading(name: string | RegExp) {
    await expect(this.page.getByRole("heading", { level: 1, name })).toBeVisible();
  }

  async expectPrimaryCtas() {
    await expect(this.page.getByRole("link", { name: "無料で試してみる" }).first()).toHaveAttribute("href", "/signup");
    await expect(this.page.getByRole("link", { name: "登録不要でデモを見る" }).first()).toHaveAttribute(
      "href",
      "/demo/flow",
    );
  }

  async openSignupFromPrimaryCta() {
    await this.page.getByRole("link", { name: "無料で試してみる" }).first().click();
    await expect(this.page).toHaveURL(/\/signup$/);
    await expect(this.page.getByRole("heading", { name: "シフトリをはじめる" })).toBeVisible();
  }
}

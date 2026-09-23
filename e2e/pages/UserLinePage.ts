import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const USER_LINE_DATA_TIMEOUT = 20_000;

/** スタッフ詳細（/staff/<personId>）の組織共通LINE連携。 */
export class UserLinePage {
  constructor(private page: Page) {}

  async goto(organizationId: string, personId: string) {
    await this.page.goto(`/staff/${personId}?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.lineRow()).toBeVisible({ timeout: USER_LINE_DATA_TIMEOUT });
  }

  async expectLineStatus(label: "LINE未連携" | "LINE連携済み") {
    await expect(this.lineRow()).toContainText(label, { timeout: USER_LINE_DATA_TIMEOUT });
  }

  async showLinkQr() {
    const dialog = await this.openDialog();
    await dialog.getByRole("button", { name: "LINE連携リンクを表示", exact: true }).click();
    await expect(dialog.getByLabel("LINE連携用QRコード")).toBeVisible({ timeout: USER_LINE_DATA_TIMEOUT });
    await this.page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }

  async disconnect() {
    const dialog = await this.openDialog();
    await dialog.getByRole("button", { name: "LINE連携を解除", exact: true }).click();
    // 解除の確認は同じDialogがalertdialogへ切り替わって表示する。
    const confirmation = this.page.getByRole("alertdialog", { name: "LINE連携を解除", exact: true });
    await expect(confirmation.getByText(/さんのLINE連携を解除しますか？$/)).toBeVisible();
    await confirmation.getByRole("button", { name: "解除する", exact: true }).click();
    await expect(this.page.getByText("この組織のLINE連携を解除しました", { exact: true })).toBeVisible();
    // 解除後は同じDialogが連携方法の表示へ戻るため、閉じてから一覧の状態を確認する。
    await expect(dialog.getByRole("button", { name: "LINE連携リンクを表示", exact: true })).toBeVisible();
    await this.page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }

  private async openDialog() {
    await this.lineRow().click();
    const dialog = this.page.getByRole("dialog", { name: "LINE連携" });
    await expect(dialog).toBeVisible({ timeout: USER_LINE_DATA_TIMEOUT });
    return dialog;
  }

  private lineRow() {
    return this.page.getByRole("button", { name: /^LINE連携を開く/ });
  }
}

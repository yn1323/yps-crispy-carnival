import { expect, type Page } from "@playwright/test";
import { revealHeaderControl } from "../helpers/headerControl";

export class UserMenu {
  constructor(private page: Page) {}

  async logout() {
    const trigger = this.page.getByRole("button", { name: "ユーザーメニュー" });
    await revealHeaderControl(trigger);
    await trigger.click();
    const logoutItem = this.page.getByRole("menuitem", { name: "ログアウト" });
    await expect(logoutItem).toBeVisible();
    await logoutItem.click();
    // Menuが閉じただけでは完了にせず、認証済みHeaderが消えるまで待つ。
    await expect(trigger).not.toBeVisible();
  }
}

import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const USER_SHOP_DATA_TIMEOUT = 20_000;

/** スタッフ詳細の店舗別設定（/staff/<personId>/shops/<shopId>）。 */
export class UserShopDetailPage {
  constructor(private page: Page) {}

  async goto(organizationId: string, personId: string, shopId: string) {
    await this.page.goto(`/staff/${personId}/shops/${shopId}?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.shiftTargetSwitch()).toBeAttached({ timeout: USER_SHOP_DATA_TIMEOUT });
  }

  async setShiftTarget(isShiftTarget: boolean) {
    const toggle = this.shiftTargetSwitch();
    await expect(toggle).toBeEnabled({ timeout: USER_SHOP_DATA_TIMEOUT });
    await expect(toggle).toBeChecked({ checked: !isShiftTarget });
    // Chakra SwitchのinputはControlの下に隠れているため、同じlabel内のControlを押す。
    await this.page
      .getByRole("heading", { name: "このユーザーをシフト対象とする", exact: true })
      .locator("..")
      .locator("label")
      .click();
    await expect(
      this.page.getByText(isShiftTarget ? "シフト対象に戻しました" : "シフト対象外にしました", { exact: true }),
    ).toBeVisible();
    await expect(toggle).toBeChecked({ checked: isShiftTarget });
  }

  private shiftTargetSwitch() {
    return this.page.getByLabel("このユーザーをシフト対象とする", { exact: true });
  }
}

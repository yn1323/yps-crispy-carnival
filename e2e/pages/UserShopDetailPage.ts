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
    await expect(this.shiftTargetRadio(true)).toBeAttached({ timeout: USER_SHOP_DATA_TIMEOUT });
  }

  async setShiftTarget(isShiftTarget: boolean) {
    const next = this.shiftTargetRadio(isShiftTarget);
    await expect(next).toBeEnabled({ timeout: USER_SHOP_DATA_TIMEOUT });
    await expect(this.shiftTargetRadio(!isShiftTarget)).toBeChecked();
    // RadioCardのinputは視覚的に隠れているため、inputを包む選択肢のlabelを押す。
    await this.page.locator("label").filter({ has: next }).click();
    await expect(
      this.page.getByText(isShiftTarget ? "シフト対象に戻しました" : "シフト対象外にしました", { exact: true }),
    ).toBeVisible();
    await expect(next).toBeChecked();
  }

  private shiftTargetRadio(isShiftTarget: boolean) {
    return this.page.getByRole("radio", { name: isShiftTarget ? /参加する/ : /参加しない/ });
  }
}

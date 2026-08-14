import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import { assertNotificationRecipientSuppressed } from "../helpers/notificationProbe";

const DASHBOARD_DATA_TIMEOUT = 20_000;
const SHOP_SWITCHER_BUTTON_NAME = /^店舗を切り替える/;

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(shopId?: string) {
    await this.page.goto(shopId ? `/dashboard?shop=${encodeURIComponent(shopId)}` : "/dashboard", {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/dashboard" && (!shopId || url.searchParams.get("shop") === shopId),
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
    await this.expectDashboardReady();
  }

  async completeSetup(data: {
    shopName: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    managerName: string;
    managerEmail: string;
  }) {
    assertNotificationRecipientSuppressed(data.managerEmail);
    await this.page.getByRole("button", { name: /お店を登録する/ }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "初回登録" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/店舗名|お店の名前/).fill(data.shopName);

    const usesTimeRange = data.shiftStartTime !== undefined || data.shiftEndTime !== undefined;
    if (usesTimeRange) {
      const timePatternButton = dialog.getByRole("button", { name: /時間指定|時間を自由に設定/ });
      await expect(timePatternButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
      await timePatternButton.click();
    }

    await dialog.getByRole("button", { name: "次へ" }).click();
    if (usesTimeRange) {
      if (data.shiftStartTime !== undefined) await this.selectTime("シフト開始時間", data.shiftStartTime);
      if (data.shiftEndTime !== undefined) await this.selectTime("シフト終了時間", data.shiftEndTime);
      await dialog.getByRole("button", { name: "次へ" }).click();
    }

    await expect(dialog.getByLabel("あなたの名前")).toBeVisible();
    await dialog.getByLabel("あなたの名前").fill(data.managerName);
    await dialog.getByLabel("メールアドレス").fill(data.managerEmail);
    await dialog.locator("[data-scope='checkbox'][data-part='control']").click();
    await dialog.getByRole("button", { name: "お店を登録してトライアルを開始", exact: true }).click();
  }

  async expectSetupComplete() {
    await expect(this.page.getByText("セットアップが完了しました")).toBeVisible();
  }

  async expectShopAvailable(shopName: string) {
    await expect(this.page).toHaveURL((url) => url.pathname === "/dashboard", { timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  async expectStaffVisible(name: string) {
    await this.expectDashboardDataLoaded();
    await expect(this.staffSection().getByText(name)).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectStaffNotVisible(name: string) {
    await this.expectDashboardDataLoaded();
    await expect(this.staffSection().getByText(name)).not.toBeVisible();
  }

  async expectSelectedShop(shopName: string, shopId: string) {
    await expect(this.page).toHaveURL(new RegExp(`/dashboard\\?shop=${escapeRegExp(shopId)}(?:&|$)`));
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  async switchShop(shopName: string, expectedShopId: string) {
    await this.page.getByRole("button", { name: SHOP_SWITCHER_BUTTON_NAME }).click();
    await this.page.getByRole("menuitem").filter({ hasText: shopName }).click();
    await this.expectSelectedShop(shopName, expectedShopId);
  }

  async switchShopAndReadId(shopName: string) {
    const currentShopId = new URL(this.page.url()).searchParams.get("shop");
    await this.page.getByRole("button", { name: SHOP_SWITCHER_BUTTON_NAME }).click();
    await this.page.getByRole("menuitem").filter({ hasText: shopName }).click();
    await expect(this.page).toHaveURL(
      (url) => {
        const shopId = url.searchParams.get("shop");
        return url.pathname === "/dashboard" && shopId !== null && shopId !== currentShopId;
      },
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    const shopId = new URL(this.page.url()).searchParams.get("shop");
    if (!shopId) throw new Error("Selected shop ID was not reflected in the Dashboard URL");
    return shopId;
  }

  async openCurrentShopDetail(shopId: string) {
    await this.page.getByRole("button", { name: "店舗詳細を開く" }).click();
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === `/shops/${shopId}` &&
        url.searchParams.get("shop") === shopId &&
        url.searchParams.get("returnTo") === "dashboard",
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
  }

  async expectSingleShopContext(shopName: string, shopId: string) {
    await this.expectSelectedShop(shopName, shopId);
    await expect(this.page.getByRole("button", { name: SHOP_SWITCHER_BUTTON_NAME })).toHaveCount(0);
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  private async expectDashboardReady() {
    const readyState = this.page
      .getByRole("button", { name: "新しい募集をつくる" })
      .or(this.page.getByRole("button", { name: /お店を登録する/ }))
      .or(this.page.getByRole("heading", { name: "この店舗を開けません" }))
      .first();
    await expect(readyState).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  private async expectDashboardDataLoaded() {
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    await expect(this.staffSection()).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  private staffSection() {
    return this.page.getByRole("region", { name: "スタッフ一覧" });
  }

  private async selectTime(label: string, value: string) {
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page
      .getByRole("listbox", { name: label })
      .getByRole("option", { name: value, exact: true })
      .click({ noWaitAfter: true });
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

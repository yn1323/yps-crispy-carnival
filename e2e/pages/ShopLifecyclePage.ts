import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const SHOP_DATA_TIMEOUT = 20_000;

export class ShopLifecyclePage {
  constructor(private page: Page) {}

  async gotoManagement(organizationId: string) {
    await this.page.goto(`/manage?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/manage" && url.searchParams.get("org") === organizationId,
      { timeout: SHOP_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "管理", exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
    const addShopButton = this.page.getByRole("button", { name: "店舗を追加する" });
    await expect(addShopButton).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
    await expect(addShopButton).toBeEnabled();
  }

  async addShop(shopName: string) {
    await this.page.getByRole("button", { name: "店舗を追加する" }).click();
    const dialog = this.page.getByRole("dialog", { name: "店舗を追加" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("お店の名前").fill(shopName);
    await dialog.getByRole("button", { name: "次へ" }).click();
    await expect(dialog.getByText("希望シフトの集め方", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /^日ごと(?:\s|$)/ }).click();
    await dialog.getByRole("button", { name: "次へ" }).click();
    await expect(dialog.getByText("毎週休みにする曜日", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "店舗を追加", exact: true }).click();

    await expect(dialog).toHaveCount(0, { timeout: SHOP_DATA_TIMEOUT });
    await this.expectShopListed(shopName);
  }

  async expectShopListed(shopName: string) {
    await expect(this.page.getByRole("button", { name: `${shopName}の店舗詳細を開く` })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
  }

  async expectShopAbsent(shopName: string) {
    await expect(this.page.getByRole("button", { name: `${shopName}の店舗詳細を開く` })).toHaveCount(0, {
      timeout: SHOP_DATA_TIMEOUT,
    });
  }

  async updateCurrentShopSettings(currentShopName: string, updatedShopName: string) {
    await expect(this.page.getByRole("heading", { name: currentShopName, exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
    await this.page.getByRole("button", { name: "編集する", exact: true }).click();

    const dialog = this.page.getByRole("dialog", { name: "店舗設定", exact: true });
    await expect(dialog).toBeVisible({ timeout: SHOP_DATA_TIMEOUT });
    await dialog.getByLabel("お店の名前").fill(updatedShopName);
    await dialog.getByRole("button", { name: "次へ", exact: true }).click();

    await expect(dialog.getByText("希望シフトの集め方", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "次へ", exact: true }).click();

    await expect(dialog.getByText("毎週休みにする曜日", { exact: true })).toBeVisible();
    const sunday = dialog.getByRole("button", { name: "日曜日を定休日にする", exact: true });
    await sunday.click();
    await expect(dialog.getByRole("button", { name: "日曜日を定休日から外す", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await dialog.getByRole("button", { name: "変更を保存", exact: true }).click();

    await expect(dialog).toHaveCount(0, { timeout: SHOP_DATA_TIMEOUT });
    await this.expectCurrentShopSettings(updatedShopName);
  }

  async expectCurrentShopSettings(shopName: string) {
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
    const basicInformation = this.page.getByRole("region", { name: "基本情報", exact: true });
    await expect(basicInformation.getByText(shopName, { exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
    await expect(basicInformation.getByText("毎週 日", { exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
  }

  async deleteCurrentShop(shopName: string) {
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
    await this.page.getByRole("button", { name: "削除する", exact: true }).click();
    const dialog = this.page.getByRole("alertdialog", { name: `${shopName}を削除しますか？` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "店舗を削除", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: SHOP_DATA_TIMEOUT });
  }

  async expectManagementReady(organizationId: string) {
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/manage" && url.searchParams.get("org") === organizationId,
      { timeout: SHOP_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "管理", exact: true })).toBeVisible({
      timeout: SHOP_DATA_TIMEOUT,
    });
  }
}

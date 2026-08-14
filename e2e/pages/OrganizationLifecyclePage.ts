import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const ORGANIZATION_DATA_TIMEOUT = 20_000;

export class OrganizationLifecyclePage {
  constructor(private page: Page) {}

  async gotoSettings(shopId: string) {
    await this.page.goto(`/settings?shop=${encodeURIComponent(shopId)}&tab=settings`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/settings" &&
        url.searchParams.get("shop") === shopId &&
        url.searchParams.get("tab") === "settings",
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("tab", { name: "設定", exact: true })).toHaveAttribute("aria-selected", "true", {
      timeout: ORGANIZATION_DATA_TIMEOUT,
    });
  }

  async createOrganization(shopName: string) {
    const createSection = this.page.getByRole("region", { name: "新しい組織を作る", exact: true });
    const createButton = createSection.getByRole("button", { name: "作成する", exact: true });
    await expect(createButton).toBeEnabled({ timeout: ORGANIZATION_DATA_TIMEOUT });
    await createButton.click();

    const dialog = this.page.getByRole("dialog", { name: "新しい組織を作る", exact: true });
    await expect(dialog).toBeVisible({ timeout: ORGANIZATION_DATA_TIMEOUT });
    await dialog.getByRole("textbox", { name: "お店の名前", exact: true }).fill(shopName);
    await dialog.getByRole("button", { name: "次へ", exact: true }).click();
    await expect(dialog.getByText("希望シフトの集め方", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /^日ごと(?:\s|$)/ }).click();
    await dialog.getByRole("button", { name: "次へ", exact: true }).click();
    await expect(dialog.getByText("毎週休みにする曜日", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "組織を作ってトライアルを開始", exact: true }).click();

    await expect(dialog).toHaveCount(0, { timeout: ORGANIZATION_DATA_TIMEOUT });
    await expect(this.page).toHaveURL((url) => url.pathname === "/dashboard" && Boolean(url.searchParams.get("shop")), {
      timeout: ORGANIZATION_DATA_TIMEOUT,
    });
    const createdShopId = new URL(this.page.url()).searchParams.get("shop");
    if (!createdShopId) throw new Error("Created organization shop was not reflected in the Dashboard URL");
    return createdShopId;
  }

  async expectCurrentOrganization(organizationName: string) {
    await expect(
      this.page.getByRole("button", { name: `${organizationName}のダッシュボードへ戻る`, exact: true }),
    ).toBeVisible({
      timeout: ORGANIZATION_DATA_TIMEOUT,
    });
  }

  async renameCurrentOrganization(nextName: string) {
    await this.page.getByRole("button", { name: "組織名を変更", exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "組織名を変更", exact: true });
    await expect(dialog).toBeVisible({ timeout: ORGANIZATION_DATA_TIMEOUT });
    await dialog.getByRole("textbox", { name: "組織名", exact: true }).fill(nextName);
    await dialog.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: ORGANIZATION_DATA_TIMEOUT });
    await this.expectCurrentOrganization(nextName);
  }

  async switchOrganization(organizationName: string, expectedShopId: string) {
    await this.page.getByRole("button", { name: /^組織を切り替える/ }).click();
    await this.page.getByRole("menuitem", { name: organizationName, exact: true }).click();
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/settings" &&
        url.searchParams.get("shop") === expectedShopId &&
        url.searchParams.get("tab") === "settings",
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    await this.expectCurrentOrganization(organizationName);
  }

  async deleteCurrentOrganization(organizationName: string) {
    await this.page.getByRole("button", { name: "削除する", exact: true }).click();
    const dialog = this.page.getByRole("alertdialog", { name: "組織を削除", exact: true });
    await expect(dialog).toBeVisible({ timeout: ORGANIZATION_DATA_TIMEOUT });
    await dialog
      .getByRole("textbox", { name: `確認のため「${organizationName}」と入力してください`, exact: true })
      .fill(organizationName);
    await dialog.getByRole("button", { name: "この組織を削除", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: ORGANIZATION_DATA_TIMEOUT });
  }

  async expectOnlyOrganization(organizationName: string, deletedOrganizationName: string) {
    await this.expectCurrentOrganization(organizationName);
    await expect(this.page.getByRole("button", { name: /^組織を切り替える/ })).toHaveCount(0);
    await expect(this.page.getByText(deletedOrganizationName, { exact: true })).toHaveCount(0);
  }
}

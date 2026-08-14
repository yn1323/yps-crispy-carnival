import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const ORGANIZATION_DATA_TIMEOUT = 20_000;

export class OrganizationLifecyclePage {
  constructor(private page: Page) {}

  async gotoManagement(organizationId: string) {
    await this.page.goto(`/app/manage?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/app/manage" && url.searchParams.get("org") === organizationId,
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "管理", exact: true })).toBeVisible({
      timeout: ORGANIZATION_DATA_TIMEOUT,
    });
  }

  async gotoOrganization(organizationId: string) {
    await this.page.goto(`/app/manage/organization?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/app/manage/organization" && url.searchParams.get("org") === organizationId,
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    await expect(
      this.page.getByRole("heading", { level: 1 }).filter({ has: this.page.getByText("組織情報", { exact: true }) }),
    ).toBeVisible({ timeout: ORGANIZATION_DATA_TIMEOUT });
  }

  async createOrganization(shopName: string) {
    const createButton = this.page.getByRole("button", { name: "新しい組織を作る", exact: true });
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
    await dialog.getByRole("button", { name: /組織を作/ }).click();

    await expect(dialog).toHaveCount(0, { timeout: ORGANIZATION_DATA_TIMEOUT });
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/dashboard" && Boolean(url.searchParams.get("org")) && Boolean(url.searchParams.get("shop")),
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    const url = new URL(this.page.url());
    const organizationId = url.searchParams.get("org");
    const shopId = url.searchParams.get("shop");
    if (!organizationId || !shopId) {
      throw new Error("Created organization and shop were not reflected in the Dashboard URL");
    }
    return { organizationId, shopId };
  }

  async expectCurrentOrganization(organizationId: string, organizationName: string) {
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/app/manage/organization" && url.searchParams.get("org") === organizationId,
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    const basicInformation = this.page.getByRole("region", { name: "基本情報", exact: true });
    await expect(basicInformation.getByText(organizationName, { exact: true })).toBeVisible({
      timeout: ORGANIZATION_DATA_TIMEOUT,
    });
  }

  async renameCurrentOrganization(nextName: string) {
    const basicInformation = this.page.getByRole("region", { name: "基本情報", exact: true });
    await basicInformation.getByRole("button", { name: "編集する", exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "組織名を変更", exact: true });
    await expect(dialog).toBeVisible({ timeout: ORGANIZATION_DATA_TIMEOUT });
    await dialog.getByRole("textbox", { name: "組織名", exact: true }).fill(nextName);
    await dialog.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: ORGANIZATION_DATA_TIMEOUT });
  }

  async switchOrganization(organizationName: string, expectedOrganizationId: string) {
    await this.page.getByRole("button", { name: /^組織を切り替える/ }).click();
    await this.page.getByRole("menuitemradio", { name: organizationName, exact: true }).click();
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/app/manage/organization" && url.searchParams.get("org") === expectedOrganizationId,
      { timeout: ORGANIZATION_DATA_TIMEOUT },
    );
    await this.expectCurrentOrganization(expectedOrganizationId, organizationName);
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

  async expectOnlyOrganization(organizationId: string, organizationName: string, deletedOrganizationName: string) {
    await this.expectCurrentOrganization(organizationId, organizationName);
    await expect(this.page.getByRole("button", { name: /^組織を切り替える/ })).toHaveCount(0);
    await expect(this.page.getByText(deletedOrganizationName, { exact: true })).toHaveCount(0);
  }
}

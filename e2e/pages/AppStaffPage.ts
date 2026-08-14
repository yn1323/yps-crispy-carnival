import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const APP_STAFF_DATA_TIMEOUT = 20_000;

export class AppStaffPage {
  constructor(private page: Page) {}

  async goto(organizationId: string, shopFilter?: string) {
    const search = new URLSearchParams({ org: organizationId });
    if (shopFilter) search.set("shopFilter", shopFilter);
    await this.page.goto(`/app/staff?${search.toString()}`, { waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/app/staff" &&
        url.searchParams.get("org") === organizationId &&
        (shopFilter ? url.searchParams.get("shopFilter") === shopFilter : !url.searchParams.has("shopFilter")),
      { timeout: APP_STAFF_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "スタッフ", exact: true })).toBeVisible({
      timeout: APP_STAFF_DATA_TIMEOUT,
    });
  }

  async expectReady({
    organizationId,
    personName,
    shopName,
  }: {
    organizationId: string;
    personName: string;
    shopName: string;
  }) {
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/app/staff" && url.searchParams.get("org") === organizationId,
      { timeout: APP_STAFF_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "スタッフ", exact: true })).toBeVisible({
      timeout: APP_STAFF_DATA_TIMEOUT,
    });
    const personRow = this.personRow(personName);
    await expect(personRow).toBeVisible({ timeout: APP_STAFF_DATA_TIMEOUT });
    await expect(personRow).toHaveAccessibleDescription(new RegExp(`所属店舗は${escapeRegExp(shopName)}です`));
  }

  personRow(personName: string) {
    return this.page.getByRole("button", { name: `${personName}のスタッフ詳細を開く`, exact: true });
  }

  async expectPersonVisible(personName: string) {
    await expect(this.personRow(personName)).toBeVisible({ timeout: APP_STAFF_DATA_TIMEOUT });
  }

  async expectPersonAbsent(personName: string) {
    await expect(this.personRow(personName)).toHaveCount(0, { timeout: APP_STAFF_DATA_TIMEOUT });
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

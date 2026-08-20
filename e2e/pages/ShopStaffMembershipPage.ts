import { expect, type Locator, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import type { ShopStaffMembershipScenarioSeed } from "../helpers/shopStaffMembershipScenario";

const SHOP_STAFF_MEMBERSHIP_TIMEOUT = 20_000;

export class ShopStaffMembershipPage {
  constructor(private page: Page) {}

  async openTargetShopFromManagement(seed: ShopStaffMembershipScenarioSeed) {
    await this.page.goto(`/manage?org=${encodeURIComponent(seed.organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page.getByRole("heading", { name: "管理", exact: true })).toBeVisible({
      timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT,
    });
    await this.page.getByRole("button", { name: `${seed.targetShopName}の店舗詳細を開く`, exact: true }).click();
    await this.expectTargetShopWithContext(seed);
  }

  async expectInitialTargetStaffList(seed: ShopStaffMembershipScenarioSeed) {
    await this.expectStaffList({
      count: 1,
      visibleNames: [seed.existingTargetName],
      hiddenNames: [seed.additionCandidateName],
    });
  }

  async addCandidate(seed: ShopStaffMembershipScenarioSeed) {
    await this.page.getByRole("button", { name: "所属スタッフを変更する", exact: true }).click();
    const dialog = this.membershipDialog();
    await expect(dialog).toBeVisible({ timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
    await expect(dialog.getByRole("group", { name: `${seed.targetShopName}の所属スタッフ`, exact: true })).toBeVisible({
      timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT,
    });

    const addition = this.membershipCheckbox(dialog, seed.additionCandidateName);
    const existing = this.membershipCheckbox(dialog, seed.existingTargetName);
    await expect(addition).not.toBeChecked();
    await expect(existing).toBeChecked();
    await dialog.getByText(seed.additionCandidateName, { exact: true }).click();
    await expect(addition).toBeChecked();
    await dialog.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
  }

  async expectCandidateAdded(seed: ShopStaffMembershipScenarioSeed) {
    await this.expectStaffList({
      count: 2,
      visibleNames: [seed.additionCandidateName, seed.existingTargetName],
      hiddenNames: [],
    });
  }

  async openCandidateStaffDetailAndReturn(seed: ShopStaffMembershipScenarioSeed) {
    await this.staffRow(seed.additionCandidateName).click();
    await expect(this.page).toHaveURL(
      (url) => /^\/staff\/[^/]+$/.test(url.pathname) && url.searchParams.get("org") === seed.organizationId,
      { timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "スタッフ詳細", exact: true })).toBeVisible({
      timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT,
    });

    await this.page.goBack({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectTargetShopWithContext(seed);
  }

  async reloadAndExpectCandidateSelected(seed: ShopStaffMembershipScenarioSeed) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectTargetShopWithContext(seed);
    await this.expectCandidateAdded(seed);

    await this.page.getByRole("button", { name: "所属スタッフを変更する", exact: true }).click();
    const dialog = this.membershipDialog();
    await expect(dialog).toBeVisible({ timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
    const addition = this.membershipCheckbox(dialog, seed.additionCandidateName);
    const existing = this.membershipCheckbox(dialog, seed.existingTargetName);
    await expect(addition).toBeChecked();
    await expect(existing).toBeChecked();
  }

  async removeAddedCandidate(seed: ShopStaffMembershipScenarioSeed) {
    const dialog = this.membershipDialog();
    const addition = this.membershipCheckbox(dialog, seed.additionCandidateName);
    await dialog.getByText(seed.additionCandidateName, { exact: true }).click();
    await expect(addition).not.toBeChecked();
    await expect(dialog.getByText("この店舗から外す", { exact: true })).toBeVisible();
    await expect(addition).toHaveAccessibleDescription(/シフト割り当てから削除.*以降シフト通知は送りません/);
    const submit = dialog.getByRole("button", { name: "変更する", exact: true });
    await expect(submit).toBeEnabled({ timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
    await submit.click();
    await expect(dialog).not.toBeVisible({ timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
  }

  async expectCandidateRemoved(seed: ShopStaffMembershipScenarioSeed) {
    await this.expectStaffList({
      count: 1,
      visibleNames: [seed.existingTargetName],
      hiddenNames: [seed.additionCandidateName],
    });
  }

  async reloadAndExpectCandidateRemoved(seed: ShopStaffMembershipScenarioSeed) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectTargetShopWithContext(seed);
    await this.expectCandidateRemoved(seed);
  }

  private async expectTargetShopWithContext(seed: ShopStaffMembershipScenarioSeed) {
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === `/manage/shops/${seed.targetShopId}` && url.searchParams.get("org") === seed.organizationId,
      { timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: seed.targetShopName, exact: true })).toBeVisible({
      timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT,
    });
  }

  private membershipDialog() {
    return this.page.getByRole("dialog", { name: "所属スタッフを変更", exact: true });
  }

  private membershipCheckbox(dialog: Locator, personName: string) {
    return dialog.getByRole("checkbox", {
      name: `${personName}を所属スタッフにする`,
      exact: true,
    });
  }

  private staffListTrigger() {
    return this.page.getByRole("button", { name: /スタッフ数.*スタッフ一覧を見る/ });
  }

  private staffRow(personName: string) {
    return this.page.getByRole("button", { name: `${personName}のスタッフ詳細を開く`, exact: true });
  }

  private async expectStaffList({
    count,
    visibleNames,
    hiddenNames,
  }: {
    count: number;
    visibleNames: string[];
    hiddenNames: string[];
  }) {
    await expect(this.staffListTrigger()).toContainText(`${count}名`, { timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
    const firstVisibleName = visibleNames[0];
    if (firstVisibleName && !(await this.staffRow(firstVisibleName).isVisible())) {
      await this.staffListTrigger().click();
    }
    for (const personName of visibleNames) {
      await expect(this.staffRow(personName)).toBeVisible({ timeout: SHOP_STAFF_MEMBERSHIP_TIMEOUT });
    }
    for (const personName of hiddenNames) {
      await expect(this.staffRow(personName)).toHaveCount(0);
    }
  }
}

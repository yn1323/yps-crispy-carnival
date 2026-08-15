import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import { AppStaffPage } from "./AppStaffPage";

const STAFF_LIFECYCLE_TIMEOUT = 20_000;

export class StaffLifecyclePage {
  private appStaff: AppStaffPage;

  constructor(private page: Page) {
    this.appStaff = new AppStaffPage(page);
  }

  async gotoStaff(organizationId: string) {
    await this.appStaff.goto(organizationId);
  }

  async addManualStaff(shopName: string, name: string, email: string) {
    await this.page.getByRole("button", { name: "スタッフを追加", exact: true }).click();
    const shopSelectionDialog = this.page.getByRole("dialog", {
      name: "スタッフを追加する店舗を選択",
      exact: true,
    });
    await expect(shopSelectionDialog).toBeVisible({ timeout: STAFF_LIFECYCLE_TIMEOUT });
    await shopSelectionDialog
      .getByRole("button", { name: `${shopName}をスタッフ追加の対象店舗として選択`, exact: true })
      .click();
    await expect(shopSelectionDialog).toHaveCount(0, { timeout: STAFF_LIFECYCLE_TIMEOUT });

    const dialog = this.page.getByRole("dialog", { name: "スタッフを追加", exact: true });
    await expect(dialog).toBeVisible({ timeout: STAFF_LIFECYCLE_TIMEOUT });

    await dialog.getByRole("button", { name: "管理者が情報を入力して追加する", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "管理者が情報を入力して追加する", exact: true })).toBeVisible({
      timeout: STAFF_LIFECYCLE_TIMEOUT,
    });

    await dialog.getByPlaceholder("例：田中 花子").first().fill(name);
    await dialog.getByPlaceholder("例：hanako@example.com").first().fill(email);
    await dialog.getByRole("button", { name: "スタッフを登録する", exact: true }).click();

    await expect(dialog).toHaveCount(0, { timeout: STAFF_LIFECYCLE_TIMEOUT });
    await this.appStaff.expectPersonVisible(name);
  }

  async openStaffDetail(name: string, organizationId: string) {
    await this.appStaff.personRow(name).click();
    await expect(this.page).toHaveURL(
      (url) => /^\/app\/staff\/[^/]+$/.test(url.pathname) && url.searchParams.get("org") === organizationId,
      { timeout: STAFF_LIFECYCLE_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "スタッフ詳細", exact: true })).toBeVisible({
      timeout: STAFF_LIFECYCLE_TIMEOUT,
    });
    await expect(this.page.getByRole("button", { name: "LINE連携を開く", exact: true })).toBeVisible({
      timeout: STAFF_LIFECYCLE_TIMEOUT,
    });
  }

  async updateStaffProfile(current: { name: string; email: string }, updated: { name: string; email: string }) {
    await this.page.getByRole("button", { name: "スタッフ情報を開く", exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "スタッフ情報", exact: true });
    await expect(dialog).toBeVisible({ timeout: STAFF_LIFECYCLE_TIMEOUT });

    const nameInput = dialog.getByRole("textbox", { name: "名前", exact: true });
    const emailInput = dialog.getByRole("textbox", {
      name: "シフト連絡先メールアドレス",
      exact: true,
    });
    await expect(nameInput).toHaveValue(current.name);
    await expect(emailInput).toHaveValue(current.email);

    await nameInput.fill(updated.name);
    await emailInput.fill(updated.email);
    await dialog.getByRole("button", { name: "変更を保存", exact: true }).click();

    await expect(dialog).toHaveCount(0, { timeout: STAFF_LIFECYCLE_TIMEOUT });
    await this.expectStaffProfile(updated.name, updated.email);
  }

  async reloadAndExpectStaffProfile(name: string, email: string) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectStaffProfile(name, email);
  }

  async removeStaffFromOrganization(name: string, organizationId: string) {
    await this.page.getByRole("button", { name: "削除する", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", { name: "スタッフを削除", exact: true });
    await expect(confirmation).toBeVisible({ timeout: STAFF_LIFECYCLE_TIMEOUT });
    await confirmation.getByRole("button", { name: "削除する", exact: true }).click();

    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/app/staff" && url.searchParams.get("org") === organizationId,
      { timeout: STAFF_LIFECYCLE_TIMEOUT },
    );
    await this.appStaff.expectPersonAbsent(name);
  }

  async reloadAndExpectStaffAbsent(name: string) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.appStaff.expectPersonAbsent(name);
  }

  async reloadAndExpectStaffVisible(name: string) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.appStaff.expectPersonVisible(name);
  }

  private async expectStaffProfile(name: string, email: string) {
    await expect(this.page.getByRole("heading", { name: "スタッフ詳細", exact: true })).toBeVisible({
      timeout: STAFF_LIFECYCLE_TIMEOUT,
    });
    await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: STAFF_LIFECYCLE_TIMEOUT });
    await expect(this.page.getByText(email, { exact: true })).toBeVisible({ timeout: STAFF_LIFECYCLE_TIMEOUT });
  }
}

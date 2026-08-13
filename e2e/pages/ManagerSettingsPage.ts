import { expect, type Locator, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import type { ManagerSettingsScenarioSeed } from "../helpers/managerSettingsScenario";

const MANAGER_SETTINGS_TIMEOUT = 20_000;

export class ManagerSettingsPage {
  constructor(private page: Page) {}

  async openFromOrganizationSettings(seed: ManagerSettingsScenarioSeed) {
    await this.page.goto(`/settings?shop=${encodeURIComponent(seed.shopId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page.getByRole("tab", { name: "スタッフ", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );

    await this.page.getByRole("button", { name: "管理者を変更", exact: true }).click();
    await this.expectMainPage(seed.shopId);
  }

  async inviteExistingStaff(seed: ManagerSettingsScenarioSeed) {
    await this.page
      .getByRole("link", {
        name: "既存スタッフを管理者として招待",
        exact: true,
      })
      .click();
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/settings/managers/invite-staff" && url.searchParams.get("shop") === seed.shopId,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );

    const candidate = this.page.getByRole("radio", {
      name: `${seed.candidateName}を選択`,
      exact: true,
    });
    await expect(candidate).not.toBeChecked({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await this.page.getByText(seed.candidateName, { exact: true }).click();
    await expect(candidate).toBeChecked();

    await this.page.getByRole("button", { name: "管理者として招待する", exact: true }).click();
    const confirmation = this.page.getByRole("alertdialog", {
      name: `${seed.candidateName}さんを招待しますか？`,
      exact: true,
    });
    await expect(confirmation).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await expect(confirmation.getByText(seed.candidateEmail, { exact: false })).toBeVisible();
    await confirmation.getByRole("button", { name: "招待する", exact: true }).click();

    await expect(this.page.getByText("送信を受け付けました", { exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });
    await this.expectMainPage(seed.shopId);
    await this.expectInvitationPending(seed);
  }

  async reloadAndExpectInvitationPending(seed: ManagerSettingsScenarioSeed) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectMainPage(seed.shopId);
    await this.expectInvitationPending(seed);
  }

  async revokeInvitation(seed: ManagerSettingsScenarioSeed) {
    await this.invitationRow(seed).getByRole("button", { name: "取り消す", exact: true }).click();

    const confirmation = this.page.getByRole("alertdialog", {
      name: "管理者招待を取り消しますか？",
      exact: true,
    });
    await expect(confirmation).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await expect(
      confirmation.getByText(`${seed.candidateName}さんへの招待を取り消します。`, { exact: true }),
    ).toBeVisible();
    await confirmation.getByRole("button", { name: "招待を取り消す", exact: true }).click();

    await expect(this.page.getByText("招待を取り消しました", { exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });
    await expect(this.invitationRow(seed)).toHaveCount(0, { timeout: MANAGER_SETTINGS_TIMEOUT });
  }

  async returnToOrganizationStaff(seed: ManagerSettingsScenarioSeed) {
    await this.page.getByRole("button", { name: "組織設定へ戻る", exact: true }).click();
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/settings" &&
        url.searchParams.get("shop") === seed.shopId &&
        url.searchParams.get("tab") === null,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );
    await expect(this.page.getByRole("tab", { name: "スタッフ", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );
  }

  private async expectMainPage(shopId: string) {
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/settings/managers" && url.searchParams.get("shop") === shopId,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );
    await expect(
      this.page.getByRole("button", { name: "組織設定へ戻る", exact: true }).getByText("管理者設定", {
        exact: true,
      }),
    ).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
  }

  private async expectInvitationPending(seed: ManagerSettingsScenarioSeed) {
    const invitation = this.invitationRow(seed);
    await expect(invitation).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await expect(invitation.getByText(seed.candidateName, { exact: true })).toBeVisible();
    await expect(invitation.getByText("招待中", { exact: true })).toBeVisible();
  }

  private invitationRow(seed: ManagerSettingsScenarioSeed): Locator {
    return this.page
      .getByRole("region", { name: "送信済みの管理者招待", exact: true })
      .getByRole("article")
      .filter({ hasText: seed.candidateEmail });
  }
}

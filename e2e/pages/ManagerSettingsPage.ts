import { expect, type Locator, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import type { ManagerSettingsScenarioSeed } from "../helpers/managerSettingsScenario";

const MANAGER_SETTINGS_TIMEOUT = 20_000;

type ManagerCandidateSeed = Pick<ManagerSettingsScenarioSeed, "organizationId" | "candidateName" | "candidateEmail">;

export class ManagerSettingsPage {
  constructor(private page: Page) {}

  async openFromOrganizationSettings(seed: ManagerCandidateSeed) {
    await this.page.goto(`/manage?org=${encodeURIComponent(seed.organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page.getByRole("heading", { name: "管理", exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });

    await this.page.getByRole("button", { name: "管理者と権限を開く", exact: true }).click();
    await this.expectMainPage(seed.organizationId);
  }

  async inviteExistingStaff(seed: ManagerCandidateSeed) {
    await this.page
      .getByRole("button", {
        name: "既存スタッフを管理者として招待",
        exact: true,
      })
      .click();
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/manage/managers" && url.searchParams.get("org") === seed.organizationId,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );

    const dialog = this.page.getByRole("dialog", {
      name: "既存スタッフを管理者として招待",
      exact: true,
    });
    await expect(dialog).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });

    const candidate = dialog.getByRole("radio", {
      name: `${seed.candidateName}を選択`,
      exact: true,
    });
    await expect(candidate).not.toBeChecked({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await candidate.locator("..").click();
    await expect(candidate).toBeChecked();
    await expect(dialog.getByText(seed.candidateEmail, { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "管理者として招待する", exact: true }).click();

    await expect(this.page.getByText("送信を受け付けました", { exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });
    await this.expectMainPage(seed.organizationId);
    await this.expectInvitationPending(seed);
  }

  async openDirectly(organizationId: string) {
    await this.page.goto(`/manage/managers?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await this.expectMainPage(organizationId);
  }

  async expectActiveManager(seed: ManagerCandidateSeed) {
    const manager = this.managerRow(seed);
    await expect(manager).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await expect(manager.getByText(seed.candidateName, { exact: true })).toBeVisible();
    await expect(manager.getByText(seed.candidateEmail, { exact: true })).toBeVisible();
  }

  async reloadAndExpectActiveManager(seed: ManagerCandidateSeed) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectMainPage(seed.organizationId);
    await this.expectActiveManager(seed);
  }

  async removeManagerRole(seed: ManagerCandidateSeed) {
    await this.managerRow(seed).getByRole("button", { name: "管理者権限を外す", exact: true }).click();

    const confirmation = this.page.getByRole("alertdialog", {
      name: `${seed.candidateName}さんの管理者権限を外しますか？`,
      exact: true,
    });
    await expect(confirmation).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await expect(
      confirmation.getByText(`${seed.candidateName}さんの組織全体に対する管理権限を外します。`, {
        exact: true,
      }),
    ).toBeVisible();
    await confirmation.getByRole("button", { name: "管理者権限を外す", exact: true }).click();

    await expect(this.page.getByText("管理者権限を外しました", { exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });
    await expect(this.managerRow(seed)).toHaveCount(0, { timeout: MANAGER_SETTINGS_TIMEOUT });
  }

  async expectAccessRevoked(organizationId: string) {
    await this.page.goto(`/manage/managers?org=${encodeURIComponent(organizationId)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/manage/managers" && url.searchParams.get("org") === organizationId,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "この組織を開けません", exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });
    await expect(this.page.getByText("管理者設定", { exact: true })).toHaveCount(0);
  }

  async reloadAndExpectInvitationPending(seed: ManagerCandidateSeed) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectMainPage(seed.organizationId);
    await this.expectInvitationPending(seed);
  }

  async revokeInvitation(seed: ManagerCandidateSeed) {
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

  async returnToManagement(seed: ManagerCandidateSeed) {
    await this.page
      .getByRole("navigation", { name: "メインメニュー" })
      .getByRole("link", { name: "管理", exact: true })
      .click();
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/manage" && url.searchParams.get("org") === seed.organizationId,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "管理", exact: true })).toBeVisible({
      timeout: MANAGER_SETTINGS_TIMEOUT,
    });
  }

  private async expectMainPage(organizationId: string) {
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/manage/managers" && url.searchParams.get("org") === organizationId,
      { timeout: MANAGER_SETTINGS_TIMEOUT },
    );
    await expect(
      this.page.getByRole("heading", { level: 1 }).filter({ has: this.page.getByText("管理者設定", { exact: true }) }),
    ).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
  }

  private async expectInvitationPending(seed: ManagerCandidateSeed) {
    const invitation = this.invitationRow(seed);
    await expect(invitation).toBeVisible({ timeout: MANAGER_SETTINGS_TIMEOUT });
    await expect(invitation.getByText(seed.candidateName, { exact: true })).toBeVisible();
    await expect(invitation.getByText("招待中", { exact: true })).toBeVisible();
  }

  private invitationRow(seed: ManagerCandidateSeed): Locator {
    return this.page
      .getByRole("article", {
        name: `${seed.candidateName}さんへの管理者招待`,
        exact: true,
      })
      .filter({ hasText: seed.candidateEmail });
  }

  private managerRow(seed: ManagerCandidateSeed): Locator {
    return this.page.getByRole("article", {
      name: `${seed.candidateName}さんの管理者情報`,
      exact: true,
    });
  }
}

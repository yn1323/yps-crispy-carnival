import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import type { ManagerLifecycleScenarioSeed } from "../helpers/managerLifecycleScenario";

const MANAGER_INVITATION_TIMEOUT = 30_000;

export class ManagerInvitationAcceptancePage {
  constructor(private page: Page) {}

  async acceptAndExpectDashboard(token: string, seed: ManagerLifecycleScenarioSeed) {
    await this.page.goto(`/manager-invite?token=${encodeURIComponent(token)}`, {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);

    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/dashboard" &&
        url.searchParams.get("org") === seed.organizationId &&
        url.searchParams.get("shop") === seed.shopId,
      { timeout: MANAGER_INVITATION_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: seed.shopName, exact: true })).toBeVisible({
      timeout: MANAGER_INVITATION_TIMEOUT,
    });
  }
}

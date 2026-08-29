import { test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { signInFreshE2EManagerSession } from "../helpers/authSession";
import { getE2EReservedMultiActorClerkUserForWorker } from "../helpers/e2eUsers";
import {
  type E2EManagerScenarioActor,
  resetManagerScenarioDataForActor,
  seedManagerScenarioForActor,
} from "../helpers/scenarioSeeds";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";
import { UserMenu } from "../pages/UserMenu";

type AuthenticatedManagerScenarioSeed = {
  organizationId: string;
  shopId: string;
};

const authLogoutTest = test.extend<{ e2eFreshManagerActor: E2EManagerScenarioActor }>({
  e2eFreshManagerActor: async ({ page }, use, testInfo) => {
    const reservedUser = getE2EReservedMultiActorClerkUserForWorker(testInfo.parallelIndex, testInfo.config.workers);
    testInfo.annotations.push({ type: "e2e-reserved-user-index", description: String(reservedUser.index) });
    const actor = await signInFreshE2EManagerSession(page, reservedUser);
    try {
      await use(actor);
    } finally {
      await resetManagerScenarioDataForActor(actor);
    }
  },
});

authLogoutTest.use({
  storageState: { cookies: [], origins: [] },
  // fresh Clerk sessionを含むため、この契約のbrowser artifactは保存しない。
  trace: "off",
  screenshot: "off",
  video: "off",
});

authLogoutTest.describe("ログアウト後の認証境界", { tag: ["@e2e-core"] }, () => {
  authLogoutTest.setTimeout(60_000);

  authLogoutTest(
    "[E2E-AUTH-02] ログアウト後に同じ保護routeへ再アクセスするとログインへ戻る",
    async ({ page, e2eFreshManagerActor }) => {
      const seed = seedManagerScenarioForActor<AuthenticatedManagerScenarioSeed>(
        e2eFreshManagerActor,
        "testing:seedAuthenticatedManagerScenario",
      );
      const protectedPath = `/dashboard?org=${encodeURIComponent(seed.organizationId)}&shop=${encodeURIComponent(seed.shopId)}`;

      await new DashboardPage(page).goto({ organizationId: seed.organizationId, shopId: seed.shopId });
      await new UserMenu(page).logout();

      const authPage = new AuthPage(page);
      await authPage.expectCurrentAuthPath("/login", protectedPath);
      await authPage.expectLoginVisible();

      await page.goto(protectedPath, { waitUntil: "commit" });
      await expectAppHydrated(page);

      await authPage.expectCurrentAuthPath("/login", protectedPath);
      await authPage.expectLoginVisible();
      await authPage.expectProtectedDashboardHidden();
    },
  );
});

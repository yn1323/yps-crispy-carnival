import { test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { AuthPage } from "../pages/AuthPage";

test.describe("認証境界", { tag: ["@e2e-core"] }, () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
  });

  test.use({ storageState: { cookies: [], origins: [] } });

  test("[E2E-AUTH-01] 匿名利用者を元の遷移先付きでログインへ誘導する", async ({ page }) => {
    await page.goto("/dashboard");
    await expectAppHydrated(page);

    await authPage.expectCurrentAuthPath("/login", "/dashboard");
    await authPage.expectLoginVisible();
  });
});

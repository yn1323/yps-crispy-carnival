import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { AuthPage } from "../pages/AuthPage";

// unsafe queryの除去前URLを扱うため、browser artifactへ画面と遷移履歴を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("認証境界", { tag: ["@e2e-core"] }, () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
  });

  // 認証操作を行わない匿名route検証では、連続navigationと競合するClerk FAPIのinterceptを登録しない。
  test.use({ clerkTestingTokenEnabled: false, storageState: { cookies: [], origins: [] } });

  test("[E2E-AUTH-01] 匿名の保護routeは安全な戻り先へ誘導し公開routeを維持する", async ({ page }) => {
    await test.step("保護routeの未許可queryを戻り先から除外する", async () => {
      await page.goto("/staff/person-a?org=org-a&token=discard-me&email=discard-me");
      await expectAppHydrated(page);

      await authPage.expectCurrentAuthPath("/login", "/staff/person-a?org=org-a");
      await authPage.expectLoginVisible();
    });

    await test.step("公開staff登録routeを保護routeとして扱わない", async () => {
      await page.goto("/staff/register");
      await expectAppHydrated(page);

      await expect(page).toHaveURL((url) => url.pathname === "/staff/register");
      await expect(page.getByRole("heading", { name: "登録リンクを確認できません" })).toBeVisible();
    });

    await test.step("公開シフト提出routeを保護routeとして扱わない", async () => {
      await page.goto("/shifts/submit");
      await expectAppHydrated(page);

      await expect(page).toHaveURL((url) => url.pathname === "/shifts/submit");
      await expect(page.getByRole("heading", { name: "このリンクでは提出できません" })).toBeVisible();
    });
  });
});

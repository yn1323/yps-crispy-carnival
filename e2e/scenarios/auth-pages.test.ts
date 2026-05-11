import { expect, test } from "../fixtures/e2eTest";
import { AuthPage } from "../pages/AuthPage";

test.describe("ログイン周り", () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
  });

  test.describe("未ログイン", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("認証必須ページはログイン画面へ誘導される", async ({ page }) => {
      await test.step("Step 1: ダッシュボードへ直接アクセスする", async () => {
        await page.goto("/dashboard");
      });

      await test.step("Step 2: 元の遷移先を保持してログイン画面に移動する", async () => {
        await authPage.expectLoginVisible();
        await authPage.expectCurrentAuthPath("/login", "/dashboard");
      });
    });

    test("ログイン・登録・パスワード再設定の導線でredirectが保持される", async () => {
      await test.step("Step 1: redirect付きでログイン画面を開く", async () => {
        await authPage.gotoLogin("/dashboard");
        await authPage.expectLoginVisible();
        await authPage.expectCurrentAuthPath("/login", "/dashboard");
      });

      await test.step("Step 2: 新規登録へ移動してもredirectが残る", async () => {
        await authPage.goToSignupFromLogin();
        await authPage.expectSignupVisible();
        await authPage.expectCurrentAuthPath("/signup", "/dashboard");
      });

      await test.step("Step 3: ログインへ戻ってもredirectが残る", async () => {
        await authPage.goToLoginFromSignup();
        await authPage.expectLoginVisible();
        await authPage.expectCurrentAuthPath("/login", "/dashboard");
      });

      await test.step("Step 4: パスワード再設定へ移動してもredirectが残る", async () => {
        await authPage.goToForgotPasswordFromLogin();
        await authPage.expectForgotPasswordVisible();
        await authPage.expectCurrentAuthPath("/forgot-password", "/dashboard");
      });

      await test.step("Step 5: ログインへ戻ってもredirectが残る", async () => {
        await authPage.goToLoginFromForgotPassword();
        await authPage.expectLoginVisible();
        await authPage.expectCurrentAuthPath("/login", "/dashboard");
      });
    });

    test("メールアドレスとパスワードでログインできる", async ({ e2eClerkUser, page }) => {
      const password = process.env.E2E_CLERK_PASSWORD ?? "";
      test.skip(!password, "E2E_CLERK_PASSWORD is required for password login.");

      await test.step("Step 1: ログイン画面を開く", async () => {
        await authPage.gotoLogin("/dashboard");
        await authPage.expectLoginVisible();
      });

      await test.step("Step 2: E2Eユーザーでログインする", async () => {
        await authPage.loginWithEmailPassword(e2eClerkUser, password);
      });

      await test.step("Step 3: redirect先のダッシュボードへ移動する", async () => {
        await expect(page).toHaveURL(/\/dashboard$/);
      });
    });
  });

  test("ログイン済みでTOPへアクセスしてもLPが表示される", async ({ page }) => {
    await test.step("Step 1: TOPへアクセスする", async () => {
      await page.goto("/");
    });

    await test.step("Step 2: ダッシュボードへ強制遷移せずLPが表示される", async () => {
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: /シフト作成を/ })).toBeVisible();
      await expect(page.getByRole("link", { name: "ログイン" }).first()).toBeVisible();
    });
  });
});

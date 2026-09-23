import { expect, test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { expectAppHydrated } from "../helpers/appReadiness";
import { convexRunJson } from "../helpers/convex";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { getE2EManagerAuthTokenIdentifier, seedManagerScenario } from "../helpers/scenarioSeeds";
import { ActionInboxPage } from "../pages/ActionInboxPage";
import { StaffLifecyclePage } from "../pages/StaffLifecyclePage";

type AuthenticatedManagerSeed = {
  organizationId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "認証境界テスト店舗";

// 登録capabilityと申請者の氏名・メールアドレスを扱うため、artifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("スタッフ本人による参加申請", { tag: ["@e2e-core", "@capability"] }, () => {
  // 登録URLの表示、匿名の登録画面、承認、スタッフ一覧を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(60_000);

  test("[E2E-REGISTRATION-01] 管理者が表示した参加URLからの申請を承認すると、スタッフ一覧に表示される", async ({
    baseURL,
    browser,
    page,
  }, testInfo) => {
    const seed = seedManagerScenario<AuthenticatedManagerSeed>("testing:seedAuthenticatedManagerScenario");
    assertNotificationDeliverySuppressed(seed.shopId);
    const applicant = {
      name: `E2E申請スタッフ${testInfo.parallelIndex}`,
      email: `e2e-registration-${testInfo.parallelIndex}-${Date.now()}@example.test`,
    };
    const staff = new StaffLifecyclePage(page);
    const inbox = new ActionInboxPage(page);

    const registrationUrl = await test.step("管理者がスタッフ追加から参加URLを表示する", async () => {
      await staff.gotoStaff(seed.organizationId);
      return await staff.readRegistrationUrl(SCENARIO_SHOP_NAME);
    });
    const registrationToken = registrationUrl.searchParams.get("token");
    if (!registrationToken) throw new Error("E2E capability was not issued: staff-registration");

    await test.step("匿名スタッフが参加URLから登録画面を開く", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-staff-registration",
        action: async (anonymousPage) => {
          await anonymousPage.goto(`${registrationUrl.pathname}${registrationUrl.search}`, {
            waitUntil: "domcontentloaded",
          });
          await expectAppHydrated(anonymousPage);
          await expect(anonymousPage.getByText("スタッフ登録", { exact: true })).toBeVisible();
          await expect(anonymousPage.getByLabel("名前")).toBeVisible();
        },
      });
    });

    await test.step("Turnstile通過後の申請を、HTTP Actionと同じ内部処理で作る", async () => {
      const result = convexRunJson<{ status: string }>("testing:submitStaffRegistrationRequestForE2E", {
        managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(),
        token: registrationToken,
        ...applicant,
      });
      expect(result.status).toBe("accepted");
    });

    await test.step("管理者が要対応で申請を承認し、スタッフ一覧に表示される", async () => {
      await inbox.gotoActions(seed.organizationId);
      await inbox.runPrimaryAction(applicant.name, "承認する");
      await staff.gotoStaff(seed.organizationId);
      await staff.expectStaffVisible(applicant.name);
    });
  });
});

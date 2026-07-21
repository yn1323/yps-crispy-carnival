import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import {
  assertNoNotificationOutbox,
  assertNotificationDeliverySuppressed,
  waitForNotificationOutbox,
} from "../helpers/notificationProbe";
import { waitForLineLinkToken, waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario, seedMultiShopOrganizationScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffRegistrationPage } from "../pages/StaffRegistrationPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type StaffRegistrationReviewSeed = {
  shopId: string;
  registrationToken: string;
  recruitmentId?: string;
};

const APPROVED_STAFF = {
  name: "承認スタッフ",
  email: "approved-registration-e2e@example.com",
};

const REJECTED_STAFF = {
  name: "却下スタッフ",
  email: "rejected-registration-e2e@example.com",
};

const EXISTING_STAFF = {
  name: "登録済みスタッフ",
  email: "existing-registration-e2e@example.com",
};

const PENDING_STAFF = {
  name: "承認待ちスタッフ",
  email: "pending-registration-e2e@example.com",
};

test.describe("スタッフ登録申請の承認/却下", { tag: ["@release"] }, () => {
  test.setTimeout(90_000);

  test("REG-P0-02: B店のスタッフ登録申請をB店だけで承認できる", { tag: ["@notification"] }, async ({
    browser,
    page,
  }) => {
    const dates = getNextWeekDates();
    const seed = seedMultiShopOrganizationScenario({
      primaryShopName: "スタッフ参加承認E2E A店",
      secondaryShopName: "スタッフ参加承認E2E B店",
      primaryMarkerPersonName: "A店登録済みスタッフ",
      primaryMarkerPersonEmail: "reg-p0-02-primary@shiftori.invalid",
      secondaryMarkerPersonName: "B店登録済みスタッフ",
      secondaryMarkerPersonEmail: "reg-p0-02-secondary@shiftori.invalid",
    });
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: B店で募集と登録リンクを用意し、スタッフが申請を送る", async () => {
      assertNotificationDeliverySuppressed(seed.secondaryShopId);
      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectSelectedShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboard.createRecruitment(dates);
      const registrationToken = await dashboard.getStaffRegistrationToken();
      const registrationContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      try {
        const registrationPage = new StaffRegistrationPage(await registrationContext.newPage());
        await registrationPage.goto(registrationToken);
        await registrationPage.expectShopName(seed.secondaryShopName);
        await registrationPage.submitRequest(APPROVED_STAFF);
      } finally {
        await registrationContext.close();
      }
    });

    await test.step("Step 2: A店には申請を出さず、B店だけで承認する", async () => {
      await dashboard.goto(seed.primaryShopId);
      await dashboard.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffNotVisible(APPROVED_STAFF.name);

      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectSelectedShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboard.expectStaffRegistrationRequestBanner(1);
      await dashboard.openStaffRegistrationRequests();
      await dashboard.approveStaffRegistrationRequest(APPROVED_STAFF.name);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffVisible(APPROVED_STAFF.name);
    });

    await test.step("Step 3: 承認スタッフ向けLINE連携案内と募集中シフト案内を確認する", async () => {
      const probe = await waitForNotificationOutbox({
        shopId: seed.secondaryShopId,
        staffEmail: APPROVED_STAFF.email,
        notificationContext: "line.sendInviteEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "line.sendInviteEmail",
        deliverySuppressed: true,
        hasStaffTarget: true,
        ctaTokenMatchesTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForLineLinkToken({
        shopId: seed.secondaryShopId,
        staffEmail: APPROVED_STAFF.email,
      });
      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);

      const recruitmentProbe = await waitForNotificationOutbox({
        shopId: seed.secondaryShopId,
        staffEmail: APPROVED_STAFF.email,
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        channel: "email",
      });
      expect(recruitmentProbe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
        ctaTokenMatchesTarget: true,
      });
      expect(recruitmentProbe.failureInbox).toHaveLength(0);

      const submitToken = await waitForMagicLinkToken({
        shopId: seed.secondaryShopId,
        staffEmail: APPROVED_STAFF.email,
        purpose: "submit",
      });
      expect(submitToken.token).toMatch(/^[0-9a-f-]{36}$/);
      expect(submitToken.recruitmentId).toBeTruthy();
      const submitContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      try {
        const submitPage = new StaffSubmitPage(await submitContext.newPage());
        await submitPage.goto(submitToken.token);
        await submitPage.expectFormVisible();
      } finally {
        await submitContext.close();
      }
    });

    await test.step("Step 4: A店には承認スタッフとB店向け通知が混入しない", async () => {
      // A店には通知種別を問わずB店向けoutboxが一件もないことをまとめて確認する。
      await assertNoNotificationOutbox({ shopId: seed.primaryShopId });
      await dashboard.goto(seed.primaryShopId);
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffNotVisible(APPROVED_STAFF.name);
    });
  });

  test("スタッフ登録→却下", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ参加却下E2E店舗",
    });
    const registrationPage = new StaffRegistrationPage(page);
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフが登録ページからスタッフ登録申請を送る", async () => {
      await registrationPage.goto(seed.registrationToken);
      await registrationPage.submitRequest(REJECTED_STAFF);
    });

    await test.step("Step 2: シフト担当者がDashboardで申請を却下する", async () => {
      await dashboard.goto();
      await dashboard.expectStaffRegistrationRequestBanner(1);
      await dashboard.openStaffRegistrationRequests();
      await dashboard.rejectStaffRegistrationRequest(REJECTED_STAFF.name);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffNotVisible(REJECTED_STAFF.name);
    });
  });

  test("登録済みのメールアドレスでも受付結果を同じ表示にする", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ登録済み重複E2E店舗",
      existingStaff: EXISTING_STAFF,
    });
    const registrationPage = new StaffRegistrationPage(page);

    await registrationPage.goto(seed.registrationToken);
    await registrationPage.submitRequest({ name: "重複申請スタッフ", email: EXISTING_STAFF.email });
  });

  test("承認待ちのメールアドレスでも受付結果を同じ表示にする", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ承認待ち重複E2E店舗",
      pendingRequest: PENDING_STAFF,
    });
    const registrationPage = new StaffRegistrationPage(page);

    await registrationPage.goto(seed.registrationToken);
    await registrationPage.submitRequest({ name: "再申請スタッフ", email: PENDING_STAFF.email });
  });
});

test.describe("シフト担当者によるスタッフ招待", { tag: ["@release"] }, () => {
  test.setTimeout(45_000);

  test("登録済みのメールアドレスではスタッフを追加できない", async ({ page }) => {
    seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ招待登録済み重複E2E店舗",
      existingStaff: EXISTING_STAFF,
    });
    const dashboard = new DashboardPage(page);

    await dashboard.goto();
    await dashboard.addStaffsAndExpectError(
      [{ name: "重複招待スタッフ", email: EXISTING_STAFF.email }],
      "このメールアドレスはすでに登録されています",
    );
    await dashboard.expectStaffNotVisible("重複招待スタッフ");
  });

  test("承認待ちのメールアドレスではスタッフを追加できない", async ({ page }) => {
    seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ招待承認待ち重複E2E店舗",
      pendingRequest: PENDING_STAFF,
    });
    const dashboard = new DashboardPage(page);

    await dashboard.goto();
    await dashboard.addStaffsAndExpectError(
      [{ name: "承認待ち重複スタッフ", email: PENDING_STAFF.email }],
      "このメールアドレスは承認待ちです",
    );
    await dashboard.expectStaffNotVisible("承認待ち重複スタッフ");
  });
});

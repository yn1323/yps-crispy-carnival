import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed, waitForNotificationOutbox } from "../helpers/notificationProbe";
import { waitForLineLinkToken, waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffRegistrationPage } from "../pages/StaffRegistrationPage";

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
  test.setTimeout(60_000);

  test("スタッフ登録→承認", { tag: ["@notification"] }, async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ参加承認E2E店舗",
      openRecruitmentDates: dates,
    });
    if (!seed.recruitmentId) throw new Error("Open recruitment was not seeded");
    const registrationPage = new StaffRegistrationPage(page);
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフが登録ページからスタッフ登録申請を送る", async () => {
      await registrationPage.goto(seed.registrationToken);
      await registrationPage.submitRequest(APPROVED_STAFF);
    });

    await test.step("Step 2: シフト担当者がDashboardで申請を承認する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.expectStaffRegistrationRequestBanner(1);
      await dashboard.openStaffRegistrationRequests();
      await dashboard.approveStaffRegistrationRequest(APPROVED_STAFF.name);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffVisible(APPROVED_STAFF.name);
    });

    await test.step("Step 3: 承認スタッフ向けLINE連携案内と募集中シフト案内を確認する", async () => {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: APPROVED_STAFF.email,
        notificationContext: "line.sendInviteEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "line.sendInviteEmail",
        deliverySuppressed: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForLineLinkToken({ shopId: seed.shopId, staffEmail: APPROVED_STAFF.email });
      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);

      const recruitmentProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
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
      });
      expect(recruitmentProbe.failureInbox).toHaveLength(0);

      const submitToken = await waitForMagicLinkToken({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: APPROVED_STAFF.email,
        purpose: "submit",
      });
      expect(submitToken.token).toMatch(/^[0-9a-f-]{36}$/);
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

  test("登録済みのメールアドレスではスタッフ登録申請を送れない", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ登録済み重複E2E店舗",
      existingStaff: EXISTING_STAFF,
    });
    const registrationPage = new StaffRegistrationPage(page);

    await registrationPage.goto(seed.registrationToken);
    await registrationPage.submitRequestAndExpectError(
      { name: "重複申請スタッフ", email: EXISTING_STAFF.email },
      "このメールアドレスは登録済みです。シフト提出や確定シフトの案内をお待ちください。",
    );
  });

  test("承認待ちのメールアドレスではスタッフ登録申請を送れない", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ承認待ち重複E2E店舗",
      pendingRequest: PENDING_STAFF,
    });
    const registrationPage = new StaffRegistrationPage(page);

    await registrationPage.goto(seed.registrationToken);
    await registrationPage.submitRequestAndExpectError(
      { name: "再申請スタッフ", email: PENDING_STAFF.email },
      "このメールアドレスは申請済みです。承認までしばらくお待ちください。",
    );
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

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasScheduledJob,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedSession,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { modules, schema } from "../_test/setup.test-helper";

const SETUP_MANAGER_SUBJECT = "scenario_setup_manager";
const INITIAL_TRIAL_ENDS_AT = Date.parse("2026-07-10T00:00:00+09:00");

describe("管理者セットアップシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("初回セットアップで店舗・管理者・manager staff・同意・初期positionが揃い、ダッシュボードに反映される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager({
      subject: SETUP_MANAGER_SUBJECT,
      name: "山田 太郎",
      email: "manager@example.com",
    });

    // Arrange / Act: 初回ユーザーがセットアップ画面から店舗とmanager情報を登録する。
    const shopId = await asManager.setupShopAndManager({
      shopName: "初回セットアップ店舗",
      submissionPattern: { kind: "dateOnly" },
      managerName: "山田 太郎",
      managerEmail: "manager@example.com",
      acceptedLegal: true,
    });

    // Assert: セットアップ後にダッシュボードへ必要な状態が揃う。
    const [currentUser, shop, staffPage, consentStatus] = await Promise.all([
      asManager.getCurrentUser(),
      asManager.getDashboardShop(),
      asManager.getDashboardStaffs(),
      asManager.getManagerConsentStatus(),
    ]);
    expect(currentUser).toMatchObject({ isNewUser: false, name: "山田 太郎", email: "manager@example.com" });
    expect(shop).toEqual({
      businessWriteBlockReason: null,
      canWriteBusinessData: true,
      name: "初回セットアップ店舗",
      planStatus: {
        canManagePlan: true,
        canUpdatePaymentMethod: false,
        kind: "trial",
        trialEndsAt: INITIAL_TRIAL_ENDS_AT,
      },
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
      trialEndingNotice: {
        trialEndsAt: INITIAL_TRIAL_ENDS_AT,
        visibleFrom: Date.parse("2026-07-03T00:00:00+09:00"),
      },
    });
    expect(staffPage.page).toMatchObject([{ name: "山田 太郎", email: "manager@example.com", isManager: true }]);
    expect(consentStatus.required).toBe(false);

    const state = await t.run(async (ctx) => {
      const positions = await ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .collect();
      const managerStaff = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .first();
      const legalEvents = await ctx.db
        .query("legalConsentEvents")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect();
      return { positions, managerStaff, legalEvents };
    });
    expect(state.positions).toMatchObject([{ name: "シフト", isDefault: true, isDeleted: false }]);
    expect(state.legalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectType: "user", method: "manager_setup" }),
        expect.objectContaining({ subjectType: "staff", method: "manager_setup" }),
      ]),
    );
    if (!state.managerStaff) throw new Error("manager staff was not created");
    const managerStaff = state.managerStaff;

    // Assert: manager staff は初回セットアップで staff 向け同意も済んでいるため、提出時の再確認を出さない。
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "manager-staff-submit-session",
        staffId: managerStaff._id,
        shopId,
        recruitmentId,
      });
    });
    const staff = scenario.staff();
    const submissionPageResult = await staff.getSubmissionPageData({
      sessionToken: "manager-staff-submit-session",
      recruitmentId,
    });
    expect(submissionPageResult.status).toBe("ok");
    if (submissionPageResult.status !== "ok") throw new Error("提出画面を取得できませんでした");
    expect(submissionPageResult.data.legalConsentRequired).toBe(false);

    const scheduled = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduled, "line/actions:sendInviteEmail", { staffId: managerStaff._id })).toBe(true);

    // Act: 管理者自身の名前とシフト連絡先を、canonical person経由で更新する。
    await asManager.editStaff({
      staffId: managerStaff._id,
      name: "山田 太郎 更新",
      email: "manager-updated@example.com",
    });

    // Assert: person/staffの連絡先だけが変わり、usersのbootstrapメールは変わらない。
    const updatedUser = await asManager.getCurrentUser();
    const updatedStaffPage = await asManager.getDashboardStaffs();
    expect(updatedUser).toMatchObject({
      isNewUser: false,
      name: "山田 太郎 更新",
      email: "manager@example.com",
    });
    expect(updatedStaffPage.page[0]).toMatchObject({
      name: "山田 太郎 更新",
      email: "manager-updated@example.com",
      isManager: true,
    });
  });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasScheduledJob, readScheduledFunctions, SCENARIO_NOW } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { modules, schema } from "../_test/setup.test-helper";

const SETUP_MANAGER_SUBJECT = "scenario_setup_manager";

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
    expect(currentUser).toEqual({ isNewUser: false, name: "山田 太郎", email: "manager@example.com" });
    expect(shop).toEqual({
      name: "初回セットアップ店舗",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
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
    expect(state.legalEvents).toMatchObject([{ method: "manager_setup" }]);
    if (!state.managerStaff) throw new Error("manager staff was not created");

    const scheduled = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduled, "line/actions:sendInviteEmail", { staffId: state.managerStaff._id })).toBe(true);

    // Act: manager自身のスタッフ情報を編集する。
    await asManager.editStaff({
      staffId: state.managerStaff._id,
      name: "山田 太郎 更新",
      email: "manager-updated@example.com",
    });

    // Assert: スタッフ表示名と管理者プロフィールが同期される。
    const updatedUser = await asManager.getCurrentUser();
    const updatedStaffPage = await asManager.getDashboardStaffs();
    expect(updatedUser).toEqual({ isNewUser: false, name: "山田 太郎 更新", email: "manager-updated@example.com" });
    expect(updatedStaffPage.page[0]).toMatchObject({
      name: "山田 太郎 更新",
      email: "manager-updated@example.com",
      isManager: true,
    });
  });
});

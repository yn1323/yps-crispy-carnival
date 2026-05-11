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

  it("初回セットアップで店舗・管理者・owner staff・同意・初期positionが揃い、ダッシュボードに反映される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager({
      subject: SETUP_MANAGER_SUBJECT,
      name: "山田 太郎",
      email: "owner@example.com",
    });

    // Arrange / Act: 初回ユーザーがセットアップ画面から店舗とowner情報を登録する。
    const shopId = await asManager.setupShopAndOwner({
      shopName: "初回セットアップ店舗",
      shiftStartTime: "09:30",
      shiftEndTime: "22:30",
      ownerName: "山田 太郎",
      ownerEmail: "owner@example.com",
      acceptedLegal: true,
    });

    // Assert: セットアップ後にダッシュボードへ必要な状態が揃う。
    const [currentUser, shop, staffPage, consentStatus] = await Promise.all([
      asManager.getCurrentUser(),
      asManager.getDashboardShop(),
      asManager.getDashboardStaffs(),
      asManager.getManagerConsentStatus(),
    ]);
    expect(currentUser).toEqual({ isNewUser: false, name: "山田 太郎", email: "owner@example.com" });
    expect(shop).toEqual({
      name: "初回セットアップ店舗",
      shiftStartTime: "09:30",
      shiftEndTime: "22:30",
    });
    expect(staffPage.page).toMatchObject([{ name: "山田 太郎", email: "owner@example.com", isOwner: true }]);
    expect(consentStatus.required).toBe(false);

    const state = await t.run(async (ctx) => {
      const positions = await ctx.db
        .query("positions")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .collect();
      const ownerStaff = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .first();
      const legalEvents = await ctx.db
        .query("legalConsentEvents")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect();
      return { positions, ownerStaff, legalEvents };
    });
    expect(state.positions).toMatchObject([{ name: "シフト", isDefault: true, isDeleted: false }]);
    expect(state.legalEvents).toMatchObject([{ method: "manager_setup" }]);
    if (!state.ownerStaff) throw new Error("owner staff was not created");

    const scheduled = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduled, "line/actions:sendInviteEmail", { staffId: state.ownerStaff._id })).toBe(true);

    // Act: owner自身のスタッフ情報を編集する。
    await asManager.editStaff({
      staffId: state.ownerStaff._id,
      name: "山田 太郎 更新",
      email: "owner-updated@example.com",
    });

    // Assert: スタッフ表示名と管理者プロフィールが同期される。
    const updatedUser = await asManager.getCurrentUser();
    const updatedStaffPage = await asManager.getDashboardStaffs();
    expect(updatedUser).toEqual({ isNewUser: false, name: "山田 太郎 更新", email: "owner-updated@example.com" });
    expect(updatedStaffPage.page[0]).toMatchObject({
      name: "山田 太郎 更新",
      email: "owner-updated@example.com",
      isOwner: true,
    });
  });
});

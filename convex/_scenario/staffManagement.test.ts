import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import {
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedSession,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("スタッフ管理シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("募集中の店舗でスタッフ追加すると一覧・提出依頼・法務/LINE案内に反映され、削除で関連トークンを無効化する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    // Arrange: 募集中のシフトがある店舗を用意する。
    const { shopId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "staff-manager@example.com",
        shopName: "スタッフ管理店舗",
      });
      return { shopId: seeded.shopId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    // Act: 店長がスタッフを追加する。
    const [staffId] = await asManager.addStaffs([{ name: "追加スタッフ", email: "new-staff@example.com" }]);

    // Assert: 一覧表示と追加直後の通知予約が更新される。
    const staffPage = await asManager.getDashboardStaffs();
    expect(staffPage.page.find((staff) => staff._id === staffId)).toMatchObject({
      name: "追加スタッフ",
      email: "new-staff@example.com",
      isLineLinked: false,
      isLineFollowing: false,
    });

    const scheduledAfterAdd = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduledAfterAdd, "legal/actions:sendStaffConsentEmail", { staffId })).toBe(true);
    expect(hasScheduledJob(scheduledAfterAdd, "line/actions:sendInviteEmail", { staffId })).toBe(true);
    expect(
      hasScheduledJob(scheduledAfterAdd, "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff", {
        staffId,
      }),
    ).toBe(true);

    const { token: magicToken } = await t.mutation(internal.notification.mutations.createMagicLink, {
      staffId,
      shopId,
      recruitmentId,
    });
    const { token: lineToken } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-staff-delete-session",
        staffId,
        shopId,
        recruitmentId,
      });
      await ctx.db.insert("staffLineAccounts", {
        staffId,
        shopId,
        lineUserId: "U_staff_delete",
        linkedAt: Date.now(),
        following: true,
        isDeleted: false,
      });
    });

    // Act: 店長がスタッフを削除する。
    await asManager.deleteStaff(staffId);

    // Assert: スタッフと関連トークン/セッション/LINE連携が無効化される。
    const stateAfterDelete = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first();
      const magicLink = await ctx.db
        .query("magicLinks")
        .withIndex("by_token", (q) => q.eq("token", magicToken))
        .first();
      const lineLink = await ctx.db
        .query("lineLinkTokens")
        .withIndex("by_token", (q) => q.eq("token", lineToken))
        .first();
      const lineAccount = await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first();
      return { staff, session, magicLink, lineLink, lineAccount };
    });
    expect(stateAfterDelete.staff?.isDeleted).toBe(true);
    expect(stateAfterDelete.session?.revokedAt).toBeTypeOf("number");
    expect(stateAfterDelete.magicLink?.revokedAt).toBeTypeOf("number");
    expect(stateAfterDelete.lineLink?.revokedAt).toBeTypeOf("number");
    expect(stateAfterDelete.lineAccount).toMatchObject({ isDeleted: true, following: false });

    const staffPageAfterDelete = await asManager.getDashboardStaffs();
    expect(staffPageAfterDelete.page.find((staff) => staff._id === staffId)).toBeUndefined();
  });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import {
  firstPage,
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedSession,
} from "../_test/scenarioBuilders";
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
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const { shopId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "staff-manager@example.com",
        shopName: "スタッフ管理店舗",
      });
      return { shopId: seeded.shopId };
    });
    const recruitmentId = await asManager.mutation(api.recruitment.mutations.createRecruitment, {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    const [staffId] = await asManager.mutation(api.staff.mutations.addStaffs, {
      entries: [{ name: "追加スタッフ", email: "new-staff@example.com" }],
    });
    const staffPage = await asManager.query(api.dashboard.queries.getDashboardStaffs, firstPage());
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

    await asManager.mutation(api.staff.mutations.deleteStaff, { staffId });

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

    const staffPageAfterDelete = await asManager.query(api.dashboard.queries.getDashboardStaffs, firstPage());
    expect(staffPageAfterDelete.page.find((staff) => staff._id === staffId)).toBeUndefined();
  });
});

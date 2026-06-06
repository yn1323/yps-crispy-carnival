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
  seedStaff,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop, seedStaffLineAccount } from "../_test/seed";
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

    // Act: シフト担当者がスタッフを追加する。
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
      accessKind: "submit",
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

    // Act: シフト担当者がスタッフを削除する。
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

  it("スタッフのメールアドレス変更後、提出可能なopen募集リンクを変更後メールへ追送する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const { shopId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "staff-manager@example.com",
        shopName: "メール変更店舗",
      });
      const seededStaffId = await seedStaff(ctx, {
        shopId: seeded.shopId,
        name: "メール変更スタッフ",
        email: "old-staff@example.com",
      });
      return { shopId: seeded.shopId, staffId: seededStaffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });
    await asManager.editStaff({ staffId, name: "メール変更スタッフ", email: "new-staff@example.com" });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId,
      expectedEmailNormalized: "new-staff@example.com",
      emailChangedAt: SCENARIO_NOW + 1,
    });

    const state = await t.run(async (ctx) => {
      const outbox = await ctx.db.query("notificationOutbox").collect();
      const magicLinks = await ctx.db
        .query("magicLinks")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect();
      return { outbox, magicLinks };
    });
    expect(state.outbox.map((job) => job.dedupeKey)).toEqual(
      expect.arrayContaining([
        `email:recruitment:${recruitmentId}:${staffId}`,
        `email:openRecruitmentEmailChange:${recruitmentId}:${staffId}:${SCENARIO_NOW + 1}`,
      ]),
    );
    expect(
      state.outbox.find(
        (job) => job.dedupeKey === `email:openRecruitmentEmailChange:${recruitmentId}:${staffId}:${SCENARIO_NOW + 1}`,
      )?.payload,
    ).toMatchObject({
      kind: "email",
      to: "new-staff@example.com",
    });
    expect(
      state.outbox.find((job) => job.dedupeKey === `email:recruitment:${recruitmentId}:${staffId}`)?.payload,
    ).toMatchObject({
      kind: "email",
      to: "old-staff@example.com",
    });
    expect(
      state.magicLinks.filter(
        (link) => link.shopId === shopId && link.recruitmentId === recruitmentId && link.accessKind === "submit",
      ),
    ).toHaveLength(1);
  });

  it("メール変更後の追送はLINE受信可能なら送らず、未連携・unfollowならメールで送る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "staff-manager@example.com",
        shopName: "LINE分岐店舗",
      });
      const emailStaffId = await seedStaff(ctx, {
        shopId,
        name: "メールスタッフ",
        email: "email-old@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "LINEスタッフ",
        email: "line-old@example.com",
      });
      const unfollowStaffId = await seedStaff(ctx, {
        shopId,
        name: "unfollowスタッフ",
        email: "unfollow-old@example.com",
      });
      await seedStaffLineAccount(ctx, {
        staffId: lineStaffId,
        shopId,
        lineUserId: "U_email_change_line",
        following: true,
      });
      await seedStaffLineAccount(ctx, {
        staffId: unfollowStaffId,
        shopId,
        lineUserId: "U_email_change_unfollow",
        following: false,
      });
      return { emailStaffId, lineStaffId, unfollowStaffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    await asManager.editStaff({ staffId: ids.emailStaffId, name: "メールスタッフ", email: "email-new@example.com" });
    await asManager.editStaff({ staffId: ids.lineStaffId, name: "LINEスタッフ", email: "line-new@example.com" });
    await asManager.editStaff({
      staffId: ids.unfollowStaffId,
      name: "unfollowスタッフ",
      email: "unfollow-new@example.com",
    });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId: ids.emailStaffId,
      expectedEmailNormalized: "email-new@example.com",
      emailChangedAt: SCENARIO_NOW + 10,
    });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId: ids.lineStaffId,
      expectedEmailNormalized: "line-new@example.com",
      emailChangedAt: SCENARIO_NOW + 11,
    });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId: ids.unfollowStaffId,
      expectedEmailNormalized: "unfollow-new@example.com",
      emailChangedAt: SCENARIO_NOW + 12,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      });
    });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId: ids.lineStaffId,
      expectedEmailNormalized: "line-new@example.com",
      emailChangedAt: SCENARIO_NOW + 13,
    });

    const outbox = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(outbox.map((job) => job.dedupeKey)).toEqual(
      expect.arrayContaining([
        `email:openRecruitmentEmailChange:${recruitmentId}:${ids.emailStaffId}:${SCENARIO_NOW + 10}`,
        `email:openRecruitmentEmailChange:${recruitmentId}:${ids.unfollowStaffId}:${SCENARIO_NOW + 12}`,
        `email:openRecruitmentEmailChange:${recruitmentId}:${ids.lineStaffId}:${SCENARIO_NOW + 13}`,
      ]),
    );
    expect(outbox.map((job) => job.dedupeKey)).not.toContain(
      `email:openRecruitmentEmailChange:${recruitmentId}:${ids.lineStaffId}:${SCENARIO_NOW + 11}`,
    );
  });

  it("メール変更後の古い予約と対象外募集は追送outboxを作らない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const { staffId, eligibleRecruitmentId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "staff-manager@example.com",
        shopName: "対象外募集店舗",
      });
      const seededStaffId = await seedStaff(ctx, {
        shopId,
        name: "対象外確認スタッフ",
        email: "first@example.com",
      });
      const eligibleId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(14),
        periodEnd: scenarioDate(20),
        deadline: scenarioDate(10),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(21),
        periodEnd: scenarioDate(27),
        deadline: scenarioDate(17),
        shopClosedDates: [],
        status: "open",
        isDeleted: true,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(-1),
        periodEnd: scenarioDate(3),
        deadline: scenarioDate(-3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { staffId: seededStaffId, eligibleRecruitmentId: eligibleId };
    });

    await asManager.editStaff({ staffId, name: "対象外確認スタッフ", email: "second@example.com" });
    await asManager.editStaff({ staffId, name: "対象外確認スタッフ", email: "third@example.com" });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId,
      expectedEmailNormalized: "second@example.com",
      emailChangedAt: SCENARIO_NOW + 20,
    });
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange, {
      staffId,
      expectedEmailNormalized: "third@example.com",
      emailChangedAt: SCENARIO_NOW + 21,
    });

    const outbox = await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
    expect(outbox.map((job) => job.dedupeKey)).toEqual([
      `email:openRecruitmentEmailChange:${eligibleRecruitmentId}:${staffId}:${SCENARIO_NOW + 21}`,
    ]);
    expect(outbox[0]?.payload).toMatchObject({
      kind: "email",
      to: "third@example.com",
    });
  });
});

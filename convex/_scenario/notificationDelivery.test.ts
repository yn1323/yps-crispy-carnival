import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { resetResendEmailQueueForTest } from "../_lib/resend";
import type { ScenarioTest } from "../_test/scenarioBuilders";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS, RESEND_EMAIL_SEND_INTERVAL_MS } from "../constants";

async function getOutboxJobs(t: ScenarioTest) {
  return await t.run(async (ctx) => await ctx.db.query("notificationOutbox").collect());
}

async function getMagicLinks(t: ScenarioTest) {
  return await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
}

describe("通知配送outboxシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "");
    resetResendEmailQueueForTest();
  });
  afterEach(() => {
    resetResendEmailQueueForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("募集作成通知actionはスタッフごとのemail/LINE outboxと提出リンクを作る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "notification-manager@example.com",
        shopName: "通知シナリオ店舗",
      });
      const emailStaffId = await seedStaff(ctx, {
        shopId,
        name: "メールスタッフ",
        email: "email-staff@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "LINEスタッフ",
        email: "line-staff@example.com",
      });
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId: lineStaffId,
        lineUserId: "U_recruitment_line",
        following: true,
      });
      return { shopId, emailStaffId, lineStaffId };
    });

    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });

    const [jobs, magicLinks] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    expect(jobs.map((job) => job.dedupeKey).sort()).toEqual([
      `email:recruitment:${recruitmentId}:${ids.emailStaffId}`,
      `line:recruitment:${recruitmentId}:${ids.lineStaffId}`,
    ]);
    expect(jobs.find((job) => job.staffId === ids.emailStaffId)).toMatchObject({
      channel: "email",
      status: "pending",
      payload: expect.objectContaining({
        kind: "email",
        to: "email-staff@example.com",
        context: "notification.sendRecruitmentNotificationEmails",
      }),
    });
    expect(jobs.find((job) => job.staffId === ids.lineStaffId)).toMatchObject({
      channel: "line",
      status: "pending",
      payload: expect.objectContaining({
        kind: "line",
        toUserId: "U_recruitment_line",
        fallbackEmail: expect.objectContaining({
          dedupeKey: `email:recruitment:${recruitmentId}:${ids.lineStaffId}`,
        }),
      }),
    });
    expect(
      magicLinks
        .filter((link) => link.recruitmentId === recruitmentId && link.accessKind === "submit")
        .map((link) => ({
          staffId: link.staffId,
          shopId: link.shopId,
        })),
    ).toEqual(
      expect.arrayContaining([
        { staffId: ids.emailStaffId, shopId: ids.shopId },
        { staffId: ids.lineStaffId, shopId: ids.shopId },
      ]),
    );
  });

  it("Resend provider delayedは既存の不達通知一覧にメール失敗として表示される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "provider-delayed-manager@example.com",
        shopName: "Provider遅延店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "遅延メールスタッフ",
        email: "provider-delayed@example.com",
      });
      return { shopId, staffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });
    const jobs = await getOutboxJobs(t);
    const emailJob = jobs.find((job) => job.channel === "email" && job.staffId === ids.staffId);
    if (!emailJob) throw new Error("email outbox was not created");
    await t.mutation(internal.notificationOutbox.mutations.markSent, {
      outboxId: emailJob._id,
      resendEmailId: "email_provider_delayed",
    });

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
      providerEventId: "svix_provider_delayed",
      providerEventType: "email.delivery_delayed",
      providerEmailId: "email_provider_delayed",
      occurredAt: SCENARIO_NOW + 1000,
      errorMessage: "Resend reported email delivery delayed",
    });

    const openPage = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(1);
    expect(openPage.page[0]).toMatchObject({
      sourceType: "provider",
      channel: "email",
      notificationKind: "recruitment",
      staffId: ids.staffId,
      staffName: "遅延メールスタッフ",
      recruitmentId,
      periodLabel: expect.any(String),
      dedupeKey: `email:recruitment:${recruitmentId}:${ids.staffId}`,
      canRetry: true,
    });
  });

  it("手動の募集通知再送はopenかつ開始前・締切前の募集を1スタッフへ送る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manual-recruitment-manager@example.com",
        shopName: "手動募集通知店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "手動送信スタッフ",
        email: "manual-recruitment@example.com",
      });
      await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(-1),
        periodEnd: scenarioDate(3),
        deadline: scenarioDate(1),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const futureOpenRecruitmentId = await ctx.db.insert("recruitments", {
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
        periodStart: scenarioDate(8),
        periodEnd: scenarioDate(14),
        deadline: scenarioDate(-1),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { staffId, futureOpenRecruitmentId };
    });

    await asManager.sendOpenRecruitmentNotifications(ids.staffId);
    await t.action(internal.notification.actions.sendOpenRecruitmentNotificationsForStaff, { staffId: ids.staffId });

    const jobs = await getOutboxJobs(t);
    expect(jobs.map((job) => job.dedupeKey)).toEqual([
      `email:manualRecruitment:${ids.futureOpenRecruitmentId}:${ids.staffId}:${SCENARIO_NOW}`,
    ]);
    expect(
      jobs.every(
        (job) =>
          job.channel === "email" &&
          job.staffId === ids.staffId &&
          job.payload.kind === "email" &&
          job.payload.context === "notification.sendOpenRecruitmentNotificationsForStaff",
      ),
    ).toBe(true);
  });

  it("自動催促actionは未提出者だけに通常submitリンクを再利用して通知する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "reminder-manager@example.com",
        shopName: "自動催促店舗",
      });
      const submittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "提出済みスタッフ",
        email: "submitted-reminder@example.com",
      });
      const emailStaffId = await seedStaff(ctx, {
        shopId,
        name: "催促メールスタッフ",
        email: "reminder-email@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "催促LINEスタッフ",
        email: "reminder-line@example.com",
      });
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId: lineStaffId,
        lineUserId: "U_reminder_line",
        following: true,
      });
      return { shopId, submittedStaffId, emailStaffId, lineStaffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });
    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, { recruitmentId });
    const linksBeforeReminder = await getMagicLinks(t);
    const submitTokenByStaff = new Map(
      linksBeforeReminder
        .filter((link) => link.recruitmentId === recruitmentId && link.accessKind === "submit")
        .map((link) => [link.staffId, link.token]),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: ids.submittedStaffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
    });

    await t.action(internal.notification.reminderActions.sendReminderEmails, { recruitmentId });

    const [jobs, linksAfterReminder] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    const reminderJobs = jobs.filter((job) => job.dedupeKey.includes(":reminder:"));
    expect(reminderJobs.map((job) => job.dedupeKey).sort()).toEqual([
      `email:reminder:${recruitmentId}:${ids.emailStaffId}`,
      `line:reminder:${recruitmentId}:${ids.lineStaffId}`,
    ]);
    expect(reminderJobs.find((job) => job.staffId === ids.emailStaffId)).toMatchObject({
      channel: "email",
      payload: expect.objectContaining({
        kind: "email",
        to: "reminder-email@example.com",
        context: "notification.sendReminderEmails",
      }),
    });
    expect(reminderJobs.find((job) => job.staffId === ids.lineStaffId)).toMatchObject({
      channel: "line",
      payload: expect.objectContaining({
        kind: "line",
        toUserId: "U_reminder_line",
        fallbackEmail: expect.objectContaining({
          dedupeKey: `email:reminder:${recruitmentId}:${ids.lineStaffId}`,
        }),
      }),
    });
    expect(linksAfterReminder).toHaveLength(linksBeforeReminder.length);
    expect(
      new Map(
        linksAfterReminder
          .filter((link) => link.recruitmentId === recruitmentId && link.accessKind === "submit")
          .map((link) => [link.staffId, link.token]),
      ),
    ).toEqual(submitTokenByStaff);

    const recruitment = await t.run(async (ctx) => await ctx.db.get(recruitmentId));
    expect(recruitment?.lastReminderSentAt).toBeTypeOf("number");

    await t.action(internal.notification.reminderActions.sendReminderEmails, { recruitmentId });
    const jobsAfterSecondRun = await getOutboxJobs(t);
    expect(jobsAfterSecondRun.filter((job) => job.dedupeKey.includes(":reminder:"))).toEqual(reminderJobs);
  });

  it("シフト確定通知actionは確定シフト閲覧用outboxとviewリンクを作る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "confirmation-manager@example.com",
        shopName: "確定通知店舗",
      });
      const emailStaffId = await seedStaff(ctx, {
        shopId,
        name: "確定メールスタッフ",
        email: "confirmation-email@example.com",
      });
      const lineStaffId = await seedStaff(ctx, {
        shopId,
        name: "確定LINEスタッフ",
        email: "confirmation-line@example.com",
      });
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId: lineStaffId,
        lineUserId: "U_confirmation_line",
        following: true,
      });
      return { emailStaffId, lineStaffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    });
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [
        { staffId: ids.emailStaffId, date: scenarioDate(7), startTime: "10:00", endTime: "18:00" },
        { staffId: ids.lineStaffId, date: scenarioDate(8), startTime: "12:00", endTime: "20:00" },
      ],
    });
    await asManager.confirmRecruitment(recruitmentId);

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, { recruitmentId, isResend: false });

    const [jobs, magicLinks] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    expect(jobs.map((job) => job.dedupeKey).sort()).toEqual([
      `email:confirmation:${recruitmentId}:${ids.emailStaffId}:confirm`,
      `line:confirmation:${recruitmentId}:${ids.lineStaffId}:confirm`,
    ]);
    expect(jobs.find((job) => job.staffId === ids.emailStaffId)).toMatchObject({
      channel: "email",
      payload: expect.objectContaining({
        kind: "email",
        to: "confirmation-email@example.com",
        subject: expect.stringContaining("シフト確定のお知らせ"),
        context: "notification.sendConfirmationEmail",
      }),
    });
    expect(jobs.find((job) => job.staffId === ids.lineStaffId)).toMatchObject({
      channel: "line",
      payload: expect.objectContaining({
        kind: "line",
        toUserId: "U_confirmation_line",
        fallbackEmail: expect.objectContaining({
          dedupeKey: `email:confirmation:${recruitmentId}:${ids.lineStaffId}:confirm`,
        }),
      }),
    });
    expect(
      magicLinks
        .filter((link) => link.recruitmentId === recruitmentId && link.accessKind === "view")
        .map((link) => link.staffId),
    ).toEqual(expect.arrayContaining([ids.emailStaffId, ids.lineStaffId]));
  });

  it("手動の現在の確定シフト通知は期間内の確定シフトだけを1スタッフへ送る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "manual-confirmation-manager@example.com",
        shopName: "手動確定通知店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "現在シフトスタッフ",
        email: "manual-confirmation@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const currentRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(-1),
        periodEnd: scenarioDate(3),
        deadline: scenarioDate(-2),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId: currentRecruitmentId,
        staffId,
        date: scenarioDate(0),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      const futureRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId: futureRecruitmentId,
        staffId,
        date: scenarioDate(7),
        startTime: "12:00",
        endTime: "20:00",
        positionId,
      });
      return { staffId, currentRecruitmentId };
    });

    await asManager.sendCurrentShiftNotification(ids.staffId);
    await t.action(internal.notification.actions.sendCurrentShiftConfirmationForStaff, { staffId: ids.staffId });

    const [jobs, magicLinks] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    expect(jobs.map((job) => job.dedupeKey)).toEqual([
      `email:manualConfirmation:${ids.currentRecruitmentId}:${ids.staffId}:${SCENARIO_NOW}`,
    ]);
    expect(jobs[0]).toMatchObject({
      channel: "email",
      staffId: ids.staffId,
      payload: expect.objectContaining({
        kind: "email",
        to: "manual-confirmation@example.com",
        context: "notification.sendConfirmationEmail",
      }),
    });
    expect(
      magicLinks
        .filter((link) => link.accessKind === "view")
        .map((link) => ({ recruitmentId: link.recruitmentId, staffId: link.staffId })),
    ).toEqual([{ recruitmentId: ids.currentRecruitmentId, staffId: ids.staffId }]);
  });

  it("確定シフト通知の複数配送失敗はFailureInbox上で最新1件だけopenにし、一斉再送も1件だけ受け付ける", async () => {
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "1");
    const t = convexTest(schema, modules);

    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "duplicate-confirmation-manager@example.com",
        shopName: "重複失敗店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "重複失敗スタッフ",
        email: "duplicate-confirmation@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(1),
        periodEnd: scenarioDate(3),
        deadline: scenarioDate(-1),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: scenarioDate(1),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { recruitmentId, staffId };
    });

    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId],
      notificationRunId: SCENARIO_NOW,
    });
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    await vi.advanceTimersByTimeAsync(RESEND_EMAIL_SEND_INTERVAL_MS + 1);
    await t.action(internal.notification.actions.sendShiftConfirmationEmails, {
      recruitmentId: ids.recruitmentId,
      isResend: true,
      targetStaffIds: [ids.staffId],
      notificationRunId: SCENARIO_NOW + 1,
    });
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const openPage = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(openPage.page).toHaveLength(1);
    expect(openPage.page[0]).toMatchObject({
      sourceType: "outbox",
      notificationKind: "confirmation",
      staffId: ids.staffId,
      recruitmentId: ids.recruitmentId,
      dedupeKey: `email:confirmation:${ids.recruitmentId}:${ids.staffId}:resend:${SCENARIO_NOW + 1}`,
      canRetry: true,
    });

    const result = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, {});
    expect(result).toMatchObject({
      scheduled: true,
      scheduledCount: 1,
      scheduledFailureIds: [openPage.page[0]._id],
    });

    const [jobs, failures, openAfterResend] = await Promise.all([
      getOutboxJobs(t),
      t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
      t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ]);
    expect(jobs.filter((job) => job.status === "pending")).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      failureKey: `logical:${jobs[0].shopId}:${ids.recruitmentId}:${ids.staffId}:confirmation`,
      status: "retrying",
    });
    expect(openAfterResend.page).toHaveLength(0);
  });

  it("配送最終失敗は要対応Inboxに出て、手動再送後はretryingからresolvedまたはopenへ遷移する", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    const fetchMock = vi.fn(async () => ({ ok: false, status: 400, text: async () => "line error" }));
    vi.stubGlobal("fetch", fetchMock);

    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "failure-manager@example.com",
        shopName: "通知失敗店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "失敗確認スタッフ",
        email: "failure-staff@example.com",
      });
      return { shopId, staffId };
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      staffId: ids.staffId,
      dedupeKey: "line:failure-inbox:scenario",
      payload: {
        kind: "line",
        toUserId: "U_failure",
        text: "hello",
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});
    const firstOpenPage = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
      });
    expect(firstOpenPage.page).toHaveLength(1);
    expect(firstOpenPage.page[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      channel: "line",
      dedupeKey: "line:failure-inbox:scenario",
      notificationContext: "line:failure-inbox",
      canRetry: true,
    });

    await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.notificationOutbox.mutations.retryFailure, { failureId: firstOpenPage.page[0]._id });
    let inbox = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(inbox[0].status).toBe("retrying");

    await t.action(internal.notificationOutbox.actions.processPending, {});
    inbox = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(inbox[0].status).toBe("open");
    expect(inbox[0].lastError).toContain("LINE push failed: 400");

    vi.advanceTimersByTime(60_000);
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.notificationOutbox.mutations.retryFailure, { failureId: firstOpenPage.page[0]._id });
    await t.action(internal.notificationOutbox.actions.processPending, {});

    inbox = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(inbox[0]).toMatchObject({ status: "resolved", resolutionKind: "sent" });
    await expect(
      t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.notificationOutbox.queries.hasOpenFailures, {}),
    ).resolves.toBe(false);
  });

  it("スタッフ参加申請の日次digestはpending時だけowner向けoutboxを作る", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "owner-digest@example.com",
        shopName: "参加申請通知店舗",
      });
    });
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const registrationLink = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    const request = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: registrationLink.token,
      name: "申請スタッフ",
      email: "digest-staff@example.com",
      acceptedLegal: true,
    });
    if (request.status !== "ok") throw new Error(`unexpected status: ${request.status}`);

    await t.action(internal.staffRegistration.actions.sendOwnerDailyDigest, {});

    const jobsBeforeApproval = await getOutboxJobs(t);
    expect(jobsBeforeApproval).toHaveLength(1);
    expect(jobsBeforeApproval[0]).toMatchObject({
      channel: "email",
      status: "pending",
      dedupeKey: expect.stringMatching(/^email:staffRegistrationDailyDigest:/),
      payload: expect.objectContaining({
        kind: "email",
        to: "owner-digest@example.com",
        context: "staffRegistration.sendOwnerDailyDigest",
      }),
    });

    await asManager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId: request.requestId,
    });
    await t.action(internal.staffRegistration.actions.sendOwnerDailyDigest, {});

    const jobsAfterApproval = await getOutboxJobs(t);
    expect(jobsAfterApproval).toEqual(jobsBeforeApproval);
  });
});

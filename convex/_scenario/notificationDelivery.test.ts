import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resetResendEmailQueueForTest } from "../_lib/resend";
import type { ScenarioTest } from "../_test/scenarioBuilders";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  NOTIFICATION_FANOUT_BATCH_SIZE,
  NOTIFICATION_FANOUT_PROCESSING_LEASE_MS,
  NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
  NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS,
  RESEND_EMAIL_SEND_INTERVAL_MS,
} from "../constants";

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
    vi.clearAllTimers();
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
        .map((link) => ({ staffId: link.staffId, shopId: link.shopId }))
        .sort((a, b) => a.staffId.localeCompare(b.staffId)),
    ).toEqual(
      [
        { staffId: ids.emailStaffId, shopId: ids.shopId },
        { staffId: ids.lineStaffId, shopId: ids.shopId },
      ].sort((a, b) => a.staffId.localeCompare(b.staffId)),
    );
  });

  it("募集fanoutは一batch後の中断から通常schedulerで再開し、persisted対象を欠落・重複なく完走する", async () => {
    const t = convexTest(schema, modules);
    const { recruitmentId, staffIds } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "fanout-resume-manager@example.com",
        shopName: "fanout再開店舗",
      });
      const staffIds: Id<"staffs">[] = [];
      for (let index = 0; index < NOTIFICATION_FANOUT_BATCH_SIZE * 2 + 5; index++) {
        staffIds.push(
          await seedStaff(ctx, {
            shopId,
            name: `fanout再開スタッフ${index}`,
            email: `fanout-resume-${index}@example.com`,
          }),
        );
      }
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { recruitmentId, staffIds };
    });
    const operationId = await t.mutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
      recruitmentId,
    });
    if (!operationId) throw new Error("fanout operation was not created");

    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId,
      fanoutOperationId: operationId,
    });
    const interrupted = await t.run(async (ctx) => ({
      operation: await ctx.db.get(operationId),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(interrupted.operation).toMatchObject({
      status: "pending",
      cursor: NOTIFICATION_FANOUT_BATCH_SIZE,
    });
    expect(interrupted.outbox).toHaveLength(NOTIFICATION_FANOUT_BATCH_SIZE);

    for (let remainingBatch = 0; remainingBatch < 2; remainingBatch++) {
      vi.advanceTimersByTime(0);
      await t.finishInProgressScheduledFunctions();
    }

    const completed = await t.run(async (ctx) => ({
      operation: await ctx.db.get(operationId),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    const expectedStaffIds = [...staffIds].sort((left, right) => left.localeCompare(right));
    const actualStaffIds = completed.outbox
      .map((job) => job.staffId)
      .filter((staffId): staffId is Id<"staffs"> => staffId !== undefined)
      .sort((left, right) => left.localeCompare(right));
    expect(completed.operation).toMatchObject({
      status: "completed",
      cursor: staffIds.length,
      targetStaffIds: expectedStaffIds,
    });
    expect(actualStaffIds).toEqual(expectedStaffIds);
    expect(new Set(actualStaffIds).size).toBe(staffIds.length);
  });

  it("fanoutがsent後に中断してlease回収されてもterminal outboxとprovider identityを再利用する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_fanout_terminal_dedupe" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "fanout-terminal-manager@example.com",
        shopName: "fanout terminal dedupe店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "terminal dedupeスタッフ",
        email: "fanout-terminal@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, staffId, recruitmentId };
    });
    const operationId = await t.mutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
      recruitmentId: ids.recruitmentId,
    });
    if (!operationId) throw new Error("fanout operation was not created");
    const claimed = await t.mutation(internal.notification.mutations.claimNotificationFanoutBatch, {
      operationId,
    });
    if (claimed.state !== "claimed") throw new Error("fanout batch was not claimed");

    // actionがenqueue後、cursor完了前に落ちた状態を作る。
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      recruitmentId: ids.recruitmentId,
      staffId: ids.staffId,
      history: { notificationKind: "shift.recruitment", displayTitle: "シフト募集のお知らせ" },
      dedupeAcrossTerminal: true,
      dedupeKey: `email:recruitment:${ids.recruitmentId}:${ids.staffId}`,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "fanout-terminal@example.com",
        subject: "シフト募集のお知らせ",
        html: "<p>fanout terminal dedupe</p>",
        context: "notification.sendRecruitmentNotificationEmails",
      },
    });
    if (!enqueued) throw new Error("fanout notification was not enqueued");
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(t.run(async (ctx) => ctx.db.get(enqueued.outboxId))).resolves.toMatchObject({
      status: "sent",
      resendEmailId: "email_fanout_terminal_dedupe",
    });

    // 再開前に優先channelがemailからLINEへ変わっても、operation×staff identityは変えない。
    await t.run(async (ctx) => {
      await seedStaffLineAccount(ctx, {
        shopId: ids.shopId,
        staffId: ids.staffId,
        lineUserId: "U_fanout_terminal_dedupe",
        following: true,
      });
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_FANOUT_PROCESSING_LEASE_MS);
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const recovered = await t.run(async (ctx) => ({
      operation: await ctx.db.get(operationId),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      submitLinks: (await ctx.db.query("magicLinks").collect()).filter((link) => link.accessKind === "submit"),
    }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(recovered.operation).toMatchObject({ status: "completed", cursor: 1 });
    expect(recovered.outbox).toEqual([
      expect.objectContaining({
        _id: enqueued.outboxId,
        status: "sent",
        resendEmailId: "email_fanout_terminal_dedupe",
        fanoutTargetKey: `fanout:shift.recruitment:v1:${ids.recruitmentId}:${ids.staffId}`,
        fanoutOperationId: operationId,
      }),
    ]);
    expect(recovered.submitLinks).toHaveLength(1);
  });

  it("募集削除は残りfanoutとenqueue済みoutboxをcancelしproviderへ送らない", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "fanout-delete-manager@example.com",
        shopName: "fanout削除店舗",
      });
      for (let index = 0; index < NOTIFICATION_FANOUT_BATCH_SIZE + 1; index++) {
        await seedStaff(ctx, {
          shopId,
          name: `fanout削除スタッフ${index}`,
          email: `fanout-delete-${index}@example.com`,
        });
      }
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { recruitmentId };
    });
    const operationId = await t.mutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
      recruitmentId: ids.recruitmentId,
    });
    if (!operationId) throw new Error("fanout operation was not created");
    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId: ids.recruitmentId,
      fanoutOperationId: operationId,
    });

    await asManager.deleteRecruitment(ids.recruitmentId);
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    const state = await t.run(async (ctx) => ({
      operation: await ctx.db.get(operationId),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.operation).toMatchObject({
      status: "cancelled",
      cancelReason: "recruitment_inactive",
      cursor: NOTIFICATION_FANOUT_BATCH_SIZE,
    });
    expect(state.outbox).toHaveLength(NOTIFICATION_FANOUT_BATCH_SIZE);
    expect(state.outbox.every((job) => job.status === "cancelled" && job.cancelReason === "recruitment_inactive")).toBe(
      true,
    );
  });

  it("最新でない確定operationと旧shape outboxはprovider直前にsupersededへ収束する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_latest_confirmation" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "confirmation-epoch-manager@example.com",
        shopName: "確定通知世代店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "確定通知世代スタッフ",
        email: "confirmation-epoch@example.com",
      });
      const latestOperationKey = "shift.confirmation:epoch:latest";
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        lastConfirmationNotificationOperationKey: latestOperationKey,
        lastConfirmationNotificationRunId: 2,
      });
      const insertOperation = async (operationKey: string, dedupeSuffix: string) =>
        await ctx.db.insert("notificationFanoutOperations", {
          operationKey,
          kind: "confirmation",
          purpose: dedupeSuffix === "confirm" ? "confirmation" : "confirmation_resend",
          recruitmentId,
          shopId,
          targetStaffIds: [staffId],
          cursor: 1,
          status: "completed",
          dedupeSuffix,
          completedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      const oldOperationId = await insertOperation("shift.confirmation:epoch:old", "confirm");
      const latestOperationId = await insertOperation(latestOperationKey, "resend:2");
      const insertOutbox = async (args: {
        dedupeKey: string;
        subject: string;
        fanoutOperationId?: Id<"notificationFanoutOperations">;
        fanoutTargetKey?: string;
      }) =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "pending",
          dedupeKey: args.dedupeKey,
          ...(args.fanoutOperationId ? { fanoutOperationId: args.fanoutOperationId } : {}),
          ...(args.fanoutTargetKey ? { fanoutTargetKey: args.fanoutTargetKey } : {}),
          shopId,
          recruitmentId,
          staffId,
          purpose: "business",
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "confirmation-epoch@example.com",
            subject: args.subject,
            html: `<p>${args.subject}</p>`,
            context: "notification.sendConfirmationEmail",
          },
          attemptCount: 0,
          nextRunAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      const oldOutboxId = await insertOutbox({
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:confirm`,
        subject: "旧確定通知",
        fanoutOperationId: oldOperationId,
        fanoutTargetKey: `fanout:shift.confirmation:epoch:old:${staffId}`,
      });
      // deploy前にenqueue済みでoperation IDを持たない別semantic rowも安全側で止める。
      const legacyOldOutboxId = await insertOutbox({
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:1`,
        subject: "旧shape再通知",
      });
      const latestOutboxId = await insertOutbox({
        dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:resend:2`,
        subject: "最新確定通知",
        fanoutOperationId: latestOperationId,
        fanoutTargetKey: `fanout:${latestOperationKey}:${staffId}`,
      });
      return { oldOutboxId, legacyOldOutboxId, latestOutboxId };
    });

    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const state = await t.run(async (ctx) => ({
      old: await ctx.db.get(ids.oldOutboxId),
      legacyOld: await ctx.db.get(ids.legacyOldOutboxId),
      latest: await ctx.db.get(ids.latestOutboxId),
    }));
    expect(state.old).toMatchObject({ status: "cancelled", cancelReason: "notification_superseded" });
    expect(state.legacyOld).toMatchObject({ status: "cancelled", cancelReason: "notification_superseded" });
    expect(state.latest).toMatchObject({ status: "sent", resendEmailId: "email_latest_confirmation" });
  });

  it("LINE fallbackは募集とfanout世代を継承し、募集削除後はemail providerへ進まない", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "fallback-scope-manager@example.com",
        shopName: "fallback scope店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "fallback scopeスタッフ",
        email: "fallback-scope@example.com",
      });
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId,
        lineUserId: "U_fallback_scope",
        following: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, staffId, recruitmentId };
    });
    const operationId = await t.mutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
      recruitmentId: ids.recruitmentId,
    });
    if (!operationId) throw new Error("fanout operation was not created");
    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId: ids.recruitmentId,
      fanoutOperationId: operationId,
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

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});
    const fallbackBeforeDeletion = (await getOutboxJobs(t)).find((job) => job.channel === "email");
    expect(fallbackBeforeDeletion).toMatchObject({
      status: "pending",
      recruitmentId: ids.recruitmentId,
      staffId: ids.staffId,
      fanoutOperationId: operationId,
    });

    await asManager.deleteRecruitment(ids.recruitmentId);
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    const jobs = await getOutboxJobs(t);
    expect(jobs.find((job) => job.channel === "line")).toMatchObject({ status: "failed" });
    expect(jobs.find((job) => job.channel === "email")).toMatchObject({
      status: "cancelled",
      cancelReason: "recruitment_inactive",
      recruitmentId: ids.recruitmentId,
      fanoutOperationId: operationId,
    });
  });

  it("enqueue後にshift対象外となったスタッフの通知はprovider直前にcancelする", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "shift-target-gate-manager@example.com",
        shopName: "shift対象再照合店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "shift対象再照合スタッフ",
        email: "shift-target-gate@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { staffId, recruitmentId };
    });
    const operationId = await t.mutation(internal.notification.mutations.ensureRecruitmentNotificationFanout, {
      recruitmentId: ids.recruitmentId,
    });
    if (!operationId) throw new Error("fanout operation was not created");
    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId: ids.recruitmentId,
      fanoutOperationId: operationId,
    });

    await asManager.setShiftExclusion(ids.staffId, true);
    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getOutboxJobs(t)).toEqual([
      expect.objectContaining({
        status: "cancelled",
        cancelReason: "recipient_inactive",
        staffId: ids.staffId,
        fanoutOperationId: operationId,
      }),
    ]);
  });

  it("worker中断で期限切れになったprocessing通知を通常drainが再claimして送信完了する", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ id: "email_recovered_lease" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "lease-recovery-manager@example.com",
        shopName: "通知lease復旧店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "lease復旧スタッフ",
        email: "lease-recovery@example.com",
      });
      return { shopId, staffId };
    });
    const enqueued = await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId: ids.shopId,
      staffId: ids.staffId,
      history: { notificationKind: "test.leaseRecovery", displayTitle: "lease復旧通知" },
      dedupeKey: "email:test:scenario-lease-recovery",
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "lease-recovery@example.com",
        subject: "lease復旧通知",
        html: "<p>lease recovery</p>",
        context: "test.leaseRecovery",
      },
    });
    if (!enqueued) throw new Error("notification was not enqueued");

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const [abandoned] = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(abandoned).toMatchObject({ _id: enqueued.outboxId, status: "processing", attemptCount: 1 });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const job = await t.run(async (ctx) => await ctx.db.get(enqueued.outboxId));
    expect(job).toMatchObject({
      status: "sent",
      attemptCount: 2,
      resendEmailId: "email_recovered_lease",
    });
    expect(job?.processingStartedAt).toBeUndefined();
    expect(job?.leaseToken).toBeUndefined();
    expect(job?.leaseExpiresAt).toBeUndefined();
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
    const [claimed] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });
    if (!claimed?.leaseToken) throw new Error("email outbox lease was not issued");
    await t.mutation(internal.notificationOutbox.mutations.markSent, {
      outboxId: emailJob._id,
      leaseToken: claimed.leaseToken,
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
        shopId: ids.shopId,
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
        .map((link) => link.staffId)
        .sort(),
    ).toEqual([ids.emailStaffId, ids.lineStaffId].sort());
  });

  it("手動の確定シフト通知は現在と将来の確定シフトを1スタッフへ送る", async () => {
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
      return { staffId, currentRecruitmentId, futureRecruitmentId };
    });

    await asManager.sendCurrentShiftNotification(ids.staffId);
    await t.action(internal.notification.actions.sendCurrentShiftConfirmationForStaff, { staffId: ids.staffId });

    const [jobs, magicLinks] = await Promise.all([getOutboxJobs(t), getMagicLinks(t)]);
    expect(jobs.map((job) => job.dedupeKey)).toEqual([
      `email:manualConfirmation:${ids.currentRecruitmentId}:${ids.staffId}:${SCENARIO_NOW}`,
      `email:manualConfirmation:${ids.futureRecruitmentId}:${ids.staffId}:${SCENARIO_NOW}`,
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
    ).toEqual([
      { recruitmentId: ids.currentRecruitmentId, staffId: ids.staffId },
      { recruitmentId: ids.futureRecruitmentId, staffId: ids.staffId },
    ]);
  });

  it("確定済み募集の配送失敗はFailureInboxに残すが再送モーダルには出さない", async () => {
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
      return { recruitmentId, shopId, staffId };
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
        shopId: ids.shopId,
      });
    expect(openPage.page).toHaveLength(0);

    const result = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.notificationOutbox.mutations.resendOpenFailures, { shopId: ids.shopId });
    expect(result).toMatchObject({
      scheduled: false,
      scheduledCount: 0,
      scheduledFailureIds: [],
      skippedCount: 1,
    });

    const [jobs, failures, openAfterResend] = await Promise.all([
      getOutboxJobs(t),
      t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect()),
      t.withIdentity({ subject: MANAGER_SUBJECT }).query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
        shopId: ids.shopId,
      }),
    ]);
    expect(jobs.filter((job) => job.status === "pending")).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      failureKey: `logical:${jobs[0].shopId}:${ids.recruitmentId}:${ids.staffId}:confirmation`,
      status: "open",
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
      await seedStaffLineAccount(ctx, {
        shopId,
        staffId,
        lineUserId: "U_failure",
      });
      return { shopId, staffId };
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "line",
      shopId: ids.shopId,
      staffId: ids.staffId,
      history: {
        notificationKind: "test.failureInbox",
        displayTitle: "シフト募集のお知らせ",
      },
      dedupeKey: "line:failure-inbox:scenario",
      payload: {
        kind: "line",
        toUserId: "U_failure",
        text: "hello",
        // 実際のLINE通知は fallbackEmail を持ち、不達の通知種別はそのcontextで判定される。
        // （通常の400失敗ではfallbackは送らないため配送挙動は変わらない）
        fallbackEmail: {
          dedupeKey: "email:recruitment:failure-inbox:scenario",
          history: {
            notificationKind: "test.failureInbox",
            displayTitle: "シフト募集のお知らせ",
          },
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: "failure-staff@example.com",
            subject: "シフト募集のお知らせ",
            html: "<p>hello</p>",
            context: "notification.sendRecruitmentNotificationEmails",
          },
        },
      },
    });

    await vi.advanceTimersByTimeAsync(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});
    const firstOpenPage = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
        shopId: ids.shopId,
      });
    expect(firstOpenPage.page).toHaveLength(1);
    expect(firstOpenPage.page[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      channel: "line",
      dedupeKey: "line:failure-inbox:scenario",
      notificationContext: "notification.sendRecruitmentNotificationEmails",
      canRetry: true,
    });

    await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.notificationOutbox.mutations.retryFailure, {
      failureId: firstOpenPage.page[0]._id,
      shopId: ids.shopId,
    });
    let inbox = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(inbox[0].status).toBe("retrying");

    await t.action(internal.notificationOutbox.actions.processPending, {});
    inbox = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(inbox[0].status).toBe("open");
    expect(inbox[0].lastError).toBe("line_recipient_rejected");

    vi.advanceTimersByTime(60_000);
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.notificationOutbox.mutations.retryFailure, {
      failureId: firstOpenPage.page[0]._id,
      shopId: ids.shopId,
    });
    await t.action(internal.notificationOutbox.actions.processPending, {});

    inbox = await t.run(async (ctx) => await ctx.db.query("notificationFailureInbox").collect());
    expect(inbox[0]).toMatchObject({ status: "resolved", resolutionKind: "sent" });
    await expect(
      t
        .withIdentity({ subject: MANAGER_SUBJECT })
        .query(api.notificationOutbox.queries.hasOpenFailures, { shopId: ids.shopId }),
    ).resolves.toBe(false);
  });

  it("スタッフ参加申請の日次digestはpending時だけowner向けoutboxを作る", async () => {
    const t = convexTest(schema, modules);

    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "owner-digest@example.com",
        shopName: "参加申請通知店舗",
      });
      return seeded.shopId;
    });
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const registrationLink = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId,
    });
    const request = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: registrationLink.token,
      name: "申請スタッフ",
      email: "digest-staff@example.com",
      acceptedLegal: true,
    });
    expect(request).toEqual({ status: "accepted" });
    const requestId = await t.run(async (ctx) => {
      const pending = await ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_shopId_emailNormalized_status", (q) =>
          q.eq("shopId", shopId).eq("emailNormalized", "digest-staff@example.com").eq("status", "pending"),
        )
        .unique();
      if (!pending) throw new Error("pending registration request not found");
      return pending._id;
    });

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
      requestId,
      shopId,
    });
    await t.action(internal.staffRegistration.actions.sendOwnerDailyDigest, {});

    const jobsAfterApproval = await getOutboxJobs(t);
    expect(jobsAfterApproval).toEqual(jobsBeforeApproval);
  });
});

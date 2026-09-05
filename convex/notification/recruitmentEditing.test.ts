import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import {
  formatDeadlineLabel,
  formatPeriodLabel,
  getReminderScheduledAt,
  getSubmitLinkCutoff,
} from "../_lib/dateFormat";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedCanonicalStaffLineRecipient, seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS } from "../constants";
import { RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT } from "../notificationOutbox/failureResend";
import { SHIFT_CONFIRMATION_REMINDER_CONTEXT } from "../notificationOutbox/shopManagerNotification";
import { ensureNotificationFanoutOperation } from "./fanout";
import type { RecruitmentUpdate } from "./recruitmentUpdate";

const firstUpdate: RecruitmentUpdate = {
  before: {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-01",
    deadline: "2026-06-23",
    shopClosedDates: [],
  },
  after: {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-03",
    deadline: "2026-06-25",
    shopClosedDates: ["2026-07-02"],
  },
};
const secondUpdate: RecruitmentUpdate = {
  before: firstUpdate.after,
  after: {
    periodStart: "2026-07-02",
    periodEnd: "2026-07-05",
    deadline: "2026-06-24",
    shopClosedDates: ["2026-07-03"],
  },
};

async function seedEditingNotifications(ctx: MutationCtx) {
  const shop = await seedManagerShop(ctx, { subject: "editing-notification-manager" });
  const staffId = await seedStaff(ctx, { shopId: shop.shopId, name: "回答スタッフ", email: "staff@example.com" });
  const recruitmentId = await ctx.db.insert("recruitments", {
    shopId: shop.shopId,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-03",
    deadline: "2026-06-25",
    shopClosedDates: ["2026-07-02"],
    status: "open",
    isDeleted: false,
    editVersion: 1,
    reminderScheduledAt: getReminderScheduledAt("2026-06-25"),
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
  return { ...shop, staffId, recruitmentId };
}

describe("募集編集に伴う通知", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T18:00:00+09:00"));
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("締切後も各編集の差分をemailとLINEへ送り、同じ編集のretryは増やさない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const ids = await seedEditingNotifications(ctx);
      const lineStaffId = await seedStaff(ctx, { shopId: ids.shopId, name: "LINEスタッフ", email: "" });
      await seedCanonicalStaffLineRecipient(ctx, { staffId: lineStaffId, lineUserId: "U_editing", following: true });
      await ctx.db.patch(ids.recruitmentId, { editVersion: 2, ...secondUpdate.after });
      const operationIds = [];
      for (const version of [1, 2]) {
        const { operation } = await ensureNotificationFanoutOperation(ctx, {
          operationKey: `shift.recruitment.update:v1:${ids.recruitmentId}:${version}`,
          kind: "recruitment",
          purpose: "recruitment_update",
          recruitmentId: ids.recruitmentId,
          shopId: ids.shopId,
          targetStaffIds: [ids.staffId, lineStaffId],
          dedupeSuffix: `recruitment_update:${version}`,
          recruitmentUpdate: version === 1 ? firstUpdate : secondUpdate,
        });
        operationIds.push(operation._id);
      }
      return { ...ids, lineStaffId, operationIds };
    });
    vi.setSystemTime(new Date("2026-06-26T00:00:00+09:00"));
    await expect(
      t.query(internal.notification.queries.getRecruitmentEmailData, { recruitmentId: ids.recruitmentId }),
    ).resolves.toBeNull();

    for (const fanoutOperationId of [...ids.operationIds, ids.operationIds[0]]) {
      await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, {
        recruitmentId: ids.recruitmentId,
        fanoutOperationId,
      });
    }

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => [job.channel, job.staffId, job.notificationContext]).sort()).toEqual(
      [
        ["email", ids.staffId, RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT],
        ["email", ids.staffId, RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT],
        ["line", ids.lineStaffId, RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT],
        ["line", ids.lineStaffId, RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT],
      ].sort(),
    );
    expect(new Set(jobs.map((job) => job.dedupeKey)).size).toBe(4);
    for (const job of jobs) {
      const update = job.fanoutOperationId === ids.operationIds[0] ? firstUpdate : secondUpdate;
      const body =
        job.payload.kind === "email" ? job.payload.html : job.payload.kind === "line" ? job.payload.text : "";
      expect(body).toContain(formatDeadlineLabel(update.before.deadline));
      expect(body).toContain(formatDeadlineLabel(update.after.deadline));
      expect(body).toContain(formatPeriodLabel(update.before.periodStart, update.before.periodEnd));
      expect(body).toContain(formatPeriodLabel(update.after.periodStart, update.after.periodEnd));
      if (job.payload.kind === "email") {
        expect(job.payload.subject).toContain(formatPeriodLabel(update.after.periodStart, update.after.periodEnd));
      }
      if (update === secondUpdate) expect(body).not.toContain(formatDeadlineLabel(firstUpdate.before.deadline));
    }
    const links = await t.run((ctx) => ctx.db.query("magicLinks").collect());
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.expiresAt === getSubmitLinkCutoff(secondUpdate.after.periodStart))).toBe(true);

    vi.setSystemTime(Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(claimed).toHaveLength(4);
    for (const job of claimed) {
      const prepared = await t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: job._id,
        leaseToken: job.leaseToken,
        now: Date.now(),
      });
      expect(prepared?._id).toBe(job._id);
      await t.mutation(internal.notificationOutbox.mutations.markRetry, {
        outboxId: job._id,
        leaseToken: job.leaseToken,
        lastError: "temporary provider failure",
        nextRunAt: Date.now() + 1_000,
      });
    }
    await t.run((ctx) => ctx.db.patch(ids.recruitmentId, { editVersion: 3, deadline: "2026-06-27" }));
    vi.setSystemTime(Date.now() + 1_000);
    const retried = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(retried).toHaveLength(4);
    for (const job of retried) {
      const prepared = await t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: job._id,
        leaseToken: job.leaseToken,
        now: Date.now(),
      });
      expect(prepared?.payload).toEqual(jobs.find((original) => original._id === job._id)?.payload);
    }
  });

  it.each(["confirmed", "started", "deleted"] as const)(
    "変更通知は%sになったら生成と配送直前の両方で停止する",
    async (change) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(seedEditingNotifications);
      await t.action(internal.notification.actions.sendRecruitmentNotificationForStaff, {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        notificationContext: RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT,
        notificationRunId: 1,
      });
      vi.setSystemTime(Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
      const jobs = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
      expect(jobs).toHaveLength(1);
      const job = jobs[0];
      if (!job) throw new Error("notification missing");
      if (change === "started") vi.setSystemTime(new Date("2026-07-01T00:00:00+09:00"));
      else
        await t.run((ctx) =>
          ctx.db.patch(ids.recruitmentId, change === "confirmed" ? { status: "confirmed" } : { isDeleted: true }),
        );
      // 開始境界はleaseの長さに左右されないよう同じ時刻にleaseを更新する。
      if (change === "started") await t.run((ctx) => ctx.db.patch(job._id, { leaseExpiresAt: Date.now() + 60_000 }));
      await expect(
        t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
          outboxId: job._id,
          leaseToken: job.leaseToken,
          now: Date.now(),
        }),
      ).resolves.toBeNull();
      await expect(t.run((ctx) => ctx.db.get(job._id))).resolves.toMatchObject({
        status: "cancelled",
        cancelReason: "recruitment_inactive",
      });
      await t.action(internal.notification.actions.sendRecruitmentNotificationForStaff, {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        notificationContext: RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT,
        notificationRunId: 2,
      });
      expect(await t.run((ctx) => ctx.db.query("notificationOutbox").collect())).toHaveLength(1);
    },
  );

  it("差分が保存されていない旧編集は比較を捏造せず、通常配信と明示再通知で現在の提出期限を案内する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const ids = await seedEditingNotifications(ctx);
      const { operation } = await ensureNotificationFanoutOperation(ctx, {
        operationKey: `shift.recruitment.update:v1:${ids.recruitmentId}:1`,
        kind: "recruitment",
        purpose: "recruitment_update",
        recruitmentId: ids.recruitmentId,
        shopId: ids.shopId,
        targetStaffIds: [ids.staffId],
        dedupeSuffix: "recruitment_update:1",
      });
      return { ...ids, operationId: operation._id };
    });
    await t.action(internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId: ids.recruitmentId,
      fanoutOperationId: ids.operationId,
    });
    await t.action(internal.notification.actions.sendRecruitmentNotificationForStaff, {
      recruitmentId: ids.recruitmentId,
      staffId: ids.staffId,
      notificationContext: RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT,
      notificationRunId: 1,
    });
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      if (job.payload.kind !== "email") throw new Error("update email missing");
      expect(job.payload.html).toContain("シフト募集の条件が変更されました");
      expect(job.payload.html).toContain(formatDeadlineLabel(firstUpdate.after.deadline));
      expect(job.payload.html).not.toContain("→");
      expect(job.payload.html).not.toContain("定休日");
    }
  });

  it.each(["shop", "recruitment", "kind", "purpose"] as const)(
    "明示再通知の差分はoperationの%s境界が不一致なら利用しない",
    async (mismatch) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const ids = await seedEditingNotifications(ctx);
        const other = await seedManagerShop(ctx, { subject: "other-editing-manager" });
        const recruitment = await ctx.db.get(ids.recruitmentId);
        if (!recruitment) throw new Error("recruitment missing");
        const otherRecruitmentId = await ctx.db.insert("recruitments", {
          shopId: other.shopId,
          ...secondUpdate.after,
          status: "open",
          isDeleted: false,
          submissionPattern: recruitment.submissionPattern,
        });
        await ensureNotificationFanoutOperation(ctx, {
          operationKey: `shift.recruitment.update:v1:${ids.recruitmentId}:1`,
          kind: mismatch === "kind" ? "confirmation" : "recruitment",
          purpose: mismatch === "purpose" ? "recruitment" : "recruitment_update",
          recruitmentId: mismatch === "recruitment" ? otherRecruitmentId : ids.recruitmentId,
          shopId: mismatch === "shop" ? other.shopId : ids.shopId,
          targetStaffIds: [ids.staffId],
          dedupeSuffix: "recruitment_update:1",
          recruitmentUpdate: firstUpdate,
        });
        return ids;
      });
      const data = await t.query(internal.notification.queries.getRecruitmentNotificationDataForStaff, {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        isUpdate: true,
      });
      expect(data).not.toBeNull();
      expect(data?.recruitmentUpdate).toBeUndefined();
    },
  );

  it("催促は再提出待ちを含み、旧予約と旧送信記録を拒否して新締切の版で再送できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const ids = await seedEditingNotifications(ctx);
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        submittedAt: Date.now(),
        firstSubmittedAt: Date.now(),
        needsResubmission: true,
      });
      const submittedId = await seedStaff(ctx, {
        shopId: ids.shopId,
        name: "提出済み",
        email: "submitted@example.com",
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId: ids.recruitmentId,
        staffId: submittedId,
        submittedAt: Date.now(),
        firstSubmittedAt: Date.now(),
      });
      return ids;
    });
    await t.action(internal.notification.reminderActions.sendReminderEmails, { recruitmentId: ids.recruitmentId });
    expect(await t.run((ctx) => ctx.db.query("notificationOutbox").collect())).toEqual([]);
    await t.action(internal.notification.reminderActions.sendReminderEmails, {
      recruitmentId: ids.recruitmentId,
      recruitmentVersionAtOrigin: 1,
    });
    await t.run((ctx) =>
      ctx.db.patch(ids.recruitmentId, {
        editVersion: 2,
        deadline: "2026-06-27",
        reminderScheduledAt: getReminderScheduledAt("2026-06-27"),
        lastReminderSentAt: undefined,
      }),
    );
    await t.mutation(internal.notification.mutations.markReminderSent, {
      recruitmentId: ids.recruitmentId,
      recruitmentVersionAtOrigin: 1,
      sentAt: Date.now(),
    });
    const recruitment = await t.run((ctx) => ctx.db.get(ids.recruitmentId));
    expect(recruitment).not.toBeNull();
    expect(recruitment?.lastReminderSentAt).toBeUndefined();
    vi.setSystemTime(new Date("2026-06-26T18:00:00+09:00"));
    await t.action(internal.notification.reminderActions.sendReminderEmails, {
      recruitmentId: ids.recruitmentId,
      recruitmentVersionAtOrigin: 1,
    });
    await t.action(internal.notification.reminderActions.sendReminderEmails, {
      recruitmentId: ids.recruitmentId,
      recruitmentVersionAtOrigin: 2,
    });
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => [job.staffId, job.recruitmentVersionAtOrigin]).sort()).toEqual([
      [ids.staffId, 1],
      [ids.staffId, 2],
    ]);
    expect(new Set(jobs.map((job) => job.dedupeKey)).size).toBe(2);
  });

  it.each(["submitted", "confirmed", "deadline", "deleted", "edited"] as const)(
    "催促のOutbox登録後に%sになったらメールとLINEの送信を止める",
    async (change) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const ids = await seedEditingNotifications(ctx);
        const line = await seedCanonicalStaffLineRecipient(ctx, {
          staffId: ids.staffId,
          lineUserId: "U_reminder_edit",
          following: true,
        });
        return { ...ids, line };
      });
      await t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "email",
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        recruitmentVersionAtOrigin: 1,
        history: { notificationKind: "shift.reminder", displayTitle: "催促" },
        dedupeKey: "email:reminder:edit-test",
        payload: {
          kind: "email",
          from: "from@example.com",
          to: "staff@example.com",
          subject: "催促",
          html: "催促",
          context: "notification.sendReminderEmails",
        },
      });
      await t.mutation(internal.notificationOutbox.mutations.enqueue, {
        channel: "line",
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        recruitmentVersionAtOrigin: 1,
        organizationPersonLineLinkId: ids.line.organizationPersonLineLinkId,
        organizationPersonLineGenerationAtEnqueue: ids.line.generation,
        history: { notificationKind: "shift.reminder", displayTitle: "催促" },
        dedupeKey: "line:reminder:edit-test",
        payload: { kind: "line", toUserId: "U_reminder_edit", text: "催促" },
      });
      vi.setSystemTime(Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
      const jobs = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
      expect(jobs).toHaveLength(2);
      await t.run(async (ctx) => {
        if (change === "submitted")
          await ctx.db.insert("shiftSubmissions", {
            recruitmentId: ids.recruitmentId,
            staffId: ids.staffId,
            submittedAt: Date.now(),
            firstSubmittedAt: Date.now(),
          });
        if (change === "confirmed") await ctx.db.patch(ids.recruitmentId, { status: "confirmed" });
        if (change === "deleted") await ctx.db.patch(ids.recruitmentId, { isDeleted: true });
        if (change === "edited") await ctx.db.patch(ids.recruitmentId, { editVersion: 2 });
        if (change === "deadline") await ctx.db.patch(ids.recruitmentId, { deadline: "2026-06-23" });
      });
      for (const job of jobs) {
        const prepare =
          job.channel === "line"
            ? internal.notificationOutbox.mutations.prepareLineForProviderDelivery
            : internal.notificationOutbox.mutations.prepareForDelivery;
        await expect(
          t.mutation(prepare, { outboxId: job._id, leaseToken: job.leaseToken, now: Date.now() }),
        ).resolves.toBeNull();
      }
      expect((await t.run((ctx) => ctx.db.query("notificationOutbox").collect())).map((job) => job.status)).toEqual([
        "cancelled",
        "cancelled",
      ]);
    },
  );

  it("管理者催促も新締切と版を確認し、旧版の送信待ちは停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const ids = await seedEditingNotifications(ctx);
      await seedStaff(ctx, {
        shopId: ids.shopId,
        userId: ids.userId,
        name: "管理者",
        email: "editing-notification-manager@example.com",
      });
      return ids;
    });
    const args = { recruitmentId: ids.recruitmentId, recruitmentVersionAtOrigin: 1 };
    await expect(
      t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, args),
    ).resolves.toBeNull();
    vi.setSystemTime(new Date("2026-06-26T17:00:00+09:00"));
    await t.action(internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder, {
      recruitmentId: ids.recruitmentId,
    });
    await t.action(internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder, args);
    vi.setSystemTime(Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const jobs = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(jobs.map((job) => [job.userId, job.recruitmentVersionAtOrigin, job.notificationContext])).toEqual([
      [ids.userId, 1, SHIFT_CONFIRMATION_REMINDER_CONTEXT],
    ]);
    await t.run((ctx) => ctx.db.patch(ids.recruitmentId, { editVersion: 2, deadline: "2026-06-27" }));
    const job = jobs[0];
    if (!job) throw new Error("manager reminder missing");
    await expect(
      t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
        outboxId: job._id,
        leaseToken: job.leaseToken,
        now: Date.now(),
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.shiftConfirmationReminder.queries.getManagerConfirmationReminderTarget, args),
    ).resolves.toBeNull();
  });

  it.each(["reminder", "update"] as const)("%sのLINE fallbackは差分・目的・催促の版を保持する", async (kind) => {
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn(() => {
      throw new Error("provider must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    const ids = await t.run(async (ctx) => {
      const ids = await seedEditingNotifications(ctx);
      await seedCanonicalStaffLineRecipient(ctx, {
        staffId: ids.staffId,
        lineUserId: "U_fallback_edit",
        following: true,
      });
      if (kind === "update") {
        await ensureNotificationFanoutOperation(ctx, {
          operationKey: `shift.recruitment.update:v1:${ids.recruitmentId}:1`,
          kind: "recruitment",
          purpose: "recruitment_update",
          recruitmentId: ids.recruitmentId,
          shopId: ids.shopId,
          targetStaffIds: [ids.staffId],
          dedupeSuffix: "recruitment_update:1",
          recruitmentUpdate: firstUpdate,
        });
      }
      return ids;
    });
    const context = kind === "reminder" ? "notification.sendReminderEmails" : RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT;
    if (kind === "reminder") {
      await t.action(internal.notification.reminderActions.sendReminderEmails, {
        recruitmentId: ids.recruitmentId,
        recruitmentVersionAtOrigin: 1,
      });
    } else {
      await t.action(internal.notification.actions.sendRecruitmentNotificationForStaff, {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        notificationContext: context,
        notificationRunId: 1,
      });
    }
    await t.run((ctx) =>
      ctx.db.insert("lineQuotaStatus", {
        checkedAt: Date.now(),
        totalQuota: 200,
        consumed: 200,
        remaining: 0,
        status: "exceeded",
        plan: "communication",
      }),
    );
    vi.setSystemTime(Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    await t.action(internal.notificationOutbox.actions.processPending, {});
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => [job.channel, job.notificationContext, job.recruitmentVersionAtOrigin]).sort()).toEqual([
      ["email", context, kind === "reminder" ? 1 : undefined],
      ["line", context, kind === "reminder" ? 1 : undefined],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    const email = jobs.find((job) => job.channel === "email");
    if (!email) throw new Error("fallback email missing");
    const line = jobs.find((job) => job.channel === "line");
    if (line?.payload.kind !== "line") throw new Error("original line payload missing");
    expect(email.payload).toEqual(line.payload.fallbackEmail?.payload);
    if (kind === "update" && email.payload.kind === "email") {
      expect(email.payload.html).toContain(formatDeadlineLabel(firstUpdate.before.deadline));
      expect(email.payload.html).toContain(formatDeadlineLabel(firstUpdate.after.deadline));
    }
    await t.run((ctx) => ctx.db.patch(ids.recruitmentId, { editVersion: 2, ...secondUpdate.after }));
    vi.setSystemTime(Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const claimed = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    expect(claimed.map((job) => job._id)).toEqual([email._id]);
    const prepared = await t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
      outboxId: email._id,
      leaseToken: claimed[0]?.leaseToken,
      now: Date.now(),
    });
    if (kind === "reminder") expect(prepared).toBeNull();
    else {
      expect(prepared?._id).toBe(email._id);
      expect(prepared?.payload).toEqual(email.payload);
    }
  });

  it.each(["reminder", "update"] as const)("管理者の明示再通知は%sを現在条件で新たに予約する", async (kind) => {
    const t = convexTest(schema, modules);
    const context = kind === "reminder" ? "notification.sendReminderEmails" : RECRUITMENT_UPDATE_NOTIFICATION_CONTEXT;
    if (kind === "update") vi.setSystemTime(new Date("2026-06-26T00:00:00+09:00"));
    const ids = await t.run(async (ctx) => {
      const ids = await seedEditingNotifications(ctx);
      await ctx.db.patch(ids.recruitmentId, {
        editVersion: 2,
        ...(kind === "update" ? secondUpdate.after : {}),
      });
      if (kind === "update") {
        for (const version of [1, 2]) {
          await ensureNotificationFanoutOperation(ctx, {
            operationKey: `shift.recruitment.update:v1:${ids.recruitmentId}:${version}`,
            kind: "recruitment",
            purpose: "recruitment_update",
            recruitmentId: ids.recruitmentId,
            shopId: ids.shopId,
            targetStaffIds: [ids.staffId],
            dedupeSuffix: `recruitment_update:${version}`,
            recruitmentUpdate: version === 1 ? firstUpdate : secondUpdate,
          });
        }
      }
      const now = Date.now();
      const failureId = await ctx.db.insert("notificationFailureInbox", {
        failureKey: `enqueue_preparation:${kind}:edit-test`,
        sourceType: "enqueue_preparation",
        status: "open",
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        channel: "email",
        dedupeKey: `email:${kind}:old-version`,
        notificationContext: context,
        firstFailedAt: now,
        lastFailedAt: now,
        lastError: "notification_enqueue_failed",
        createdAt: now,
        updatedAt: now,
      });
      return { ...ids, failureId };
    });
    await expect(
      t
        .withIdentity({ subject: "editing-notification-manager" })
        .mutation(api.notificationOutbox.mutations.resendFailure, {
          shopId: ids.shopId,
          expectedOrganizationId: ids.organizationId,
          failureId: ids.failureId,
        }),
    ).resolves.toEqual({ scheduled: true });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((job) => ({ name: job.name, args: job.args[0] }))).toEqual([
      {
        name:
          kind === "reminder"
            ? "notification/reminderActions:sendReminderEmailForStaff"
            : "notification/actions:sendRecruitmentNotificationForStaff",
        args: {
          recruitmentId: ids.recruitmentId,
          staffId: ids.staffId,
          notificationRunId: Date.now(),
          organizationBillingVersionAtOrigin: 1,
          ...(kind === "reminder" ? { recruitmentVersionAtOrigin: 2 } : { notificationContext: context }),
        },
      },
    ]);
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => [job.staffId, job.notificationContext, job.recruitmentVersionAtOrigin])).toEqual([
      [ids.staffId, context, kind === "reminder" ? 2 : undefined],
    ]);
    if (kind === "update") {
      const payload = jobs[0]?.payload;
      if (payload?.kind !== "email") throw new Error("resend email missing");
      expect(payload.html).toContain(formatDeadlineLabel(secondUpdate.before.deadline));
      expect(payload.html).toContain(formatDeadlineLabel(secondUpdate.after.deadline));
      expect(payload.html).not.toContain(formatDeadlineLabel(firstUpdate.before.deadline));
      expect(payload.subject).toContain(
        formatPeriodLabel(secondUpdate.after.periodStart, secondUpdate.after.periodEnd),
      );
    }
  });
});

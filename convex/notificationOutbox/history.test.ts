import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS } from "../constants";
import { NOTIFICATION_HISTORY_DISPLAY_TITLE_MAX_LENGTH, normalizeNotificationHistoryInput } from "./history";

const HISTORY = {
  notificationKind: "test.staffNotification",
  displayTitle: "シフト募集のお知らせ",
};

describe("notificationOutbox/history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T03:00:00.000Z"));
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("スタッフ向け実通知をOutboxと同じtransactionで1履歴にし、dedupeでは増やさない", async () => {
    const { t, shopId, staffId } = await setupStaff();

    const first = await enqueueStaffEmail(t, { shopId, staffId, dedupeKey: "email:test:history-dedupe" });
    const second = await enqueueStaffEmail(t, { shopId, staffId, dedupeKey: "email:test:history-dedupe" });

    expect(second).toEqual({ outboxId: first?.outboxId, deduped: true });
    const [outboxes, histories] = await t.run(async (ctx) =>
      Promise.all([ctx.db.query("notificationOutbox").collect(), ctx.db.query("notificationHistory").collect()]),
    );
    expect(outboxes).toHaveLength(1);
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      outboxId: first?.outboxId,
      shopId,
      staffId,
      channel: "email",
      ...HISTORY,
      sendStatus: "queued",
      deliveryStatus: "unknown",
      requestedAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(histories[0]).not.toHaveProperty("payload");
    expect(histories[0]).not.toHaveProperty("to");
    expect(histories[0]).not.toHaveProperty("errorMessage");
  });

  it.each([
    "notice",
    "notice.staff_v2",
    `a${"b".repeat(79)}`,
  ])("notificationKindの許可形式を受け付ける: %s", (notificationKind) => {
    expect(normalizeNotificationHistoryInput({ notificationKind, displayTitle: "通知" })).toEqual({
      notificationKind,
      displayTitle: "通知",
    });
  });

  it.each([
    "Notice",
    "1notice",
    "notice staff",
    "notice/invalid",
    `a${"b".repeat(80)}`,
  ])("notificationKindの不正形式を拒否する: %s", (notificationKind) => {
    expect(() => normalizeNotificationHistoryInput({ notificationKind, displayTitle: "通知" })).toThrow();
  });

  it("displayTitleをtrimし、空白だけは拒否し、120文字を超えた分だけ切り詰める", () => {
    expect(() => normalizeNotificationHistoryInput({ notificationKind: "notice", displayTitle: "   " })).toThrow();

    const exact = "あ".repeat(NOTIFICATION_HISTORY_DISPLAY_TITLE_MAX_LENGTH);
    expect(
      normalizeNotificationHistoryInput({ notificationKind: "notice", displayTitle: ` ${exact} ` }).displayTitle,
    ).toBe(exact);
    expect(
      normalizeNotificationHistoryInput({ notificationKind: "notice", displayTitle: `${exact}追加` }).displayTitle,
    ).toBe(exact);
  });

  it("明示抑止と環境delivery modeによる抑止ではOutboxだけを作り履歴を残さない", async () => {
    const explicit = await setupStaff();
    await enqueueStaffEmail(explicit.t, {
      shopId: explicit.shopId,
      staffId: explicit.staffId,
      dedupeKey: "email:test:history-suppressed-explicit",
      suppressDelivery: true,
    });
    await expect(collectHistories(explicit.t)).resolves.toEqual([]);

    for (const mode of ["dry-run", "disabled", "mock"]) {
      vi.stubEnv("NOTIFICATION_DELIVERY_MODE", mode);
      const current = await setupStaff();
      await enqueueStaffEmail(current.t, {
        shopId: current.shopId,
        staffId: current.staffId,
        dedupeKey: `email:test:history-suppressed-${mode}`,
      });
      await expect(collectHistories(current.t)).resolves.toEqual([]);
    }
  });

  it("非スタッフ通知と旧fallback互換分岐は履歴を作らない", async () => {
    const { t, shopId, staffId, userId } = await setupStaff();
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      userId,
      dedupeKey: "email:test:manager-no-history",
      payload: emailPayload("manager@example.com"),
    });
    await t.mutation(internal.notificationOutbox.mutations.enqueue, {
      channel: "email",
      shopId,
      staffId,
      historyMode: "legacy_no_history",
      dedupeKey: "email:test:legacy-no-history",
      payload: emailPayload("staff@example.com"),
    });

    await expect(collectHistories(t)).resolves.toEqual([]);
  });

  it("markRetry・markSent・markFailed・cancelを同じ履歴へ同期し、markSentは配信状態を戻さない", async () => {
    const { t, shopId, staffId } = await setupStaff();

    const retry = await enqueueStaffEmail(t, { shopId, staffId, dedupeKey: "email:test:history-retry" });
    if (!retry) throw new Error("retry notification was not enqueued");
    const [retryClaim] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });
    if (!retryClaim?.leaseToken) throw new Error("retry lease was not issued");
    await t.mutation(internal.notificationOutbox.mutations.markRetry, {
      outboxId: retry.outboxId,
      leaseToken: retryClaim.leaseToken,
      lastError: "temporary",
      nextRunAt: Date.now() + 1_000,
    });
    expect(await historyForOutbox(t, retry.outboxId)).toMatchObject({ sendStatus: "queued" });

    vi.advanceTimersByTime(1_000);
    const [sentClaim] = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    if (!sentClaim?.leaseToken) throw new Error("sent lease was not issued");
    await t.mutation(internal.notificationOutbox.mutations.markSent, {
      outboxId: retry.outboxId,
      leaseToken: sentClaim.leaseToken,
      resendEmailId: "email_history_sent",
    });
    expect(await historyForOutbox(t, retry.outboxId)).toMatchObject({
      sendStatus: "sent",
      sentAt: Date.now(),
    });

    await t.mutation(internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate, {
      providerEventId: "svix_history_delivered",
      providerEventType: "email.delivered",
      providerEmailId: "email_history_sent",
      occurredAt: Date.now() + 500,
    });
    vi.advanceTimersByTime(1_000);
    await t.mutation(internal.notificationOutbox.mutations.markSent, {
      outboxId: retry.outboxId,
      leaseToken: sentClaim.leaseToken,
    });
    expect(await historyForOutbox(t, retry.outboxId)).toMatchObject({
      sendStatus: "sent",
      deliveryStatus: "delivered",
    });

    const failed = await enqueueStaffEmail(t, { shopId, staffId, dedupeKey: "email:test:history-failed" });
    if (!failed) throw new Error("failed notification was not enqueued");
    const [failedClaim] = await t.mutation(internal.notificationOutbox.mutations.claimDue, {
      now: Date.now() + NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS,
    });
    if (!failedClaim?.leaseToken) throw new Error("failed lease was not issued");
    await t.mutation(internal.notificationOutbox.mutations.markFailed, {
      outboxId: failed.outboxId,
      leaseToken: failedClaim.leaseToken,
      lastError: "final",
      suppressFailureInbox: true,
    });
    expect(await historyForOutbox(t, failed.outboxId)).toMatchObject({
      sendStatus: "failed",
      failedAt: Date.now(),
    });

    const cancelled = await enqueueStaffEmail(t, { shopId, staffId, dedupeKey: "email:test:history-cancelled" });
    if (!cancelled) throw new Error("cancelled notification was not enqueued");
    await t.run(async (ctx) => await ctx.db.patch(staffId, { isDeleted: true }));
    vi.advanceTimersByTime(NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS);
    const cancelledClaims = await t.mutation(internal.notificationOutbox.mutations.claimDue, { now: Date.now() });
    const cancelledClaim = cancelledClaims.find((job) => job._id === cancelled.outboxId);
    if (!cancelledClaim?.leaseToken) throw new Error("cancelled lease was not issued");
    await t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
      outboxId: cancelled.outboxId,
      leaseToken: cancelledClaim.leaseToken,
      now: Date.now(),
    });
    expect(await historyForOutbox(t, cancelled.outboxId)).toMatchObject({ sendStatus: "cancelled" });
  });

  it("履歴のない既存Outboxの状態更新は従来どおり成功する", async () => {
    const { t, shopId, staffId } = await setupStaff();
    const outboxId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "processing",
        dedupeKey: "email:test:predeploy",
        shopId,
        staffId,
        payload: emailPayload("staff@example.com"),
        attemptCount: 1,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.markSent, { outboxId, resendEmailId: "email_predeploy" }),
    ).resolves.toBe(true);
    await expect(historyForOutbox(t, outboxId)).resolves.toBeNull();
  });
});

async function setupStaff() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const { shopId, userId } = await seedManagerShop(ctx, {
      subject: "history_manager",
      email: "manager@example.com",
      shopName: "通知履歴店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "通知履歴スタッフ",
      email: "staff@example.com",
      isDeleted: false,
    });
    return { shopId, staffId, userId };
  });
  return { t, ...ids };
}

async function enqueueStaffEmail(
  t: TestConvex<typeof schema>,
  input: {
    shopId: Id<"shops">;
    staffId: Id<"staffs">;
    dedupeKey: string;
    suppressDelivery?: boolean;
  },
) {
  return await t.mutation(internal.notificationOutbox.mutations.enqueue, {
    channel: "email",
    shopId: input.shopId,
    staffId: input.staffId,
    history: HISTORY,
    dedupeKey: input.dedupeKey,
    payload: emailPayload("staff@example.com", input.suppressDelivery),
  });
}

function emailPayload(to: string, suppressDelivery?: boolean) {
  return {
    kind: "email" as const,
    from: "シフトリ <noreply@example.com>",
    to,
    subject: HISTORY.displayTitle,
    html: "<p>本文とtoken付きURLは履歴へ保存しない</p>",
    context: "test.notificationHistory",
    ...(suppressDelivery ? { suppressDelivery: true } : {}),
  };
}

async function collectHistories(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => await ctx.db.query("notificationHistory").collect());
}

async function historyForOutbox(t: TestConvex<typeof schema>, outboxId: Id<"notificationOutbox">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("notificationHistory")
        .withIndex("by_outboxId", (q) => q.eq("outboxId", outboxId))
        .unique(),
  );
}

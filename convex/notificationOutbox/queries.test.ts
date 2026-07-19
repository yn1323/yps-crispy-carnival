import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseWriter } from "../_generated/server";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notificationOutbox/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("listStaffNotificationHistoryは同一店舗の履歴だけを最新順にページングし、最小DTOを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const primary = await seedManagerShop(ctx, {
        subject: "history_query_primary",
        email: "history-query-primary@example.com",
        shopName: "履歴主店舗",
      });
      const other = await seedManagerShop(ctx, {
        subject: "history_query_other",
        email: "history-query-other@example.com",
        shopName: "履歴別店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: primary.shopId,
        name: "履歴スタッフ",
        email: "history-staff@example.com",
        isDeleted: false,
      });
      const otherStaffId = await ctx.db.insert("staffs", {
        shopId: other.shopId,
        name: "別店舗スタッフ",
        email: "other-history-staff@example.com",
        isDeleted: false,
      });
      const deletedStaffId = await ctx.db.insert("staffs", {
        shopId: primary.shopId,
        name: "削除済みスタッフ",
        email: "deleted-history-staff@example.com",
        isDeleted: true,
      });
      const missingStaffId = await ctx.db.insert("staffs", {
        shopId: primary.shopId,
        name: "物理削除スタッフ",
        email: "missing-history-staff@example.com",
        isDeleted: false,
      });
      await ctx.db.delete(missingStaffId);

      const historyIds: Id<"notificationHistory">[] = [];
      for (let index = 0; index < 25; index++) {
        historyIds.push(
          await insertNotificationHistoryFixture(ctx, {
            shopId: primary.shopId,
            staffId,
            requestedAt: Date.now() + index,
            sentAt: Date.now() + index + 100,
            displayTitle: `通知${index}`,
            sendStatus: "sent",
            deliveryStatus: "unknown",
          }),
        );
      }
      await insertNotificationHistoryFixture(ctx, {
        shopId: other.shopId,
        staffId: otherStaffId,
        requestedAt: Date.now() + 1_000,
        displayTitle: "別店舗通知",
        sendStatus: "sent",
        deliveryStatus: "unknown",
      });

      return {
        shopId: primary.shopId,
        staffId,
        otherStaffId,
        deletedStaffId,
        missingStaffId,
        historyIds,
      };
    });

    const unauthenticated = await t.query(api.notificationOutbox.queries.listStaffNotificationHistory, {
      shopId: ids.shopId,
      staffId: ids.staffId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(unauthenticated.page).toEqual([]);

    const first = await t
      .withIdentity({ subject: "history_query_primary" })
      .query(api.notificationOutbox.queries.listStaffNotificationHistory, {
        shopId: ids.shopId,
        staffId: ids.staffId,
        paginationOpts: { numItems: 20, cursor: null },
      });
    expect(first.page.map((history) => history._id)).toEqual([...ids.historyIds].reverse().slice(0, 20));
    expect(first.isDone).toBe(false);
    expect(Object.keys(first.page[0]).sort()).toEqual(
      ["_id", "channel", "displayStatus", "displayTitle", "requestedAt", "sentAt"].sort(),
    );
    expect(first.page[0]).not.toHaveProperty("payload");
    expect(first.page[0]).not.toHaveProperty("notificationKind");
    expect(first.page[0]).not.toHaveProperty("deliveryStatusAt");

    const second = await t
      .withIdentity({ subject: "history_query_primary" })
      .query(api.notificationOutbox.queries.listStaffNotificationHistory, {
        shopId: ids.shopId,
        staffId: ids.staffId,
        paginationOpts: { numItems: 20, cursor: first.continueCursor },
      });
    expect(second.page.map((history) => history._id)).toEqual([...ids.historyIds].reverse().slice(20));
    expect(second.isDone).toBe(true);
    expect(new Set([...first.page, ...second.page].map((history) => history._id)).size).toBe(25);

    for (const inaccessibleStaffId of [ids.otherStaffId, ids.deletedStaffId, ids.missingStaffId]) {
      const page = await t
        .withIdentity({ subject: "history_query_primary" })
        .query(api.notificationOutbox.queries.listStaffNotificationHistory, {
          shopId: ids.shopId,
          staffId: inaccessibleStaffId,
          paginationOpts: { numItems: 20, cursor: null },
        });
      expect(page).toEqual({ page: [], isDone: true, continueCursor: "" });
    }
  });

  it("listStaffNotificationHistoryは送信・配信状態を表示用の機械値へ優先順どおり正規化する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "history_query_status",
        email: "history-query-status@example.com",
        shopName: "履歴状態店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "履歴状態スタッフ",
        email: "history-status-staff@example.com",
        isDeleted: false,
      });
      const statuses: Array<{
        displayTitle: string;
        sendStatus: Doc<"notificationHistory">["sendStatus"];
        deliveryStatus: Doc<"notificationHistory">["deliveryStatus"];
      }> = [
        { displayTitle: "cancelled", sendStatus: "cancelled", deliveryStatus: "delivered" },
        { displayTitle: "delivered", sendStatus: "queued", deliveryStatus: "delivered" },
        { displayTitle: "delayed", sendStatus: "sent", deliveryStatus: "delayed" },
        { displayTitle: "provider-failed", sendStatus: "sent", deliveryStatus: "bounced" },
        { displayTitle: "send-failed", sendStatus: "failed", deliveryStatus: "unknown" },
        { displayTitle: "sent", sendStatus: "sent", deliveryStatus: "unknown" },
        { displayTitle: "queued", sendStatus: "queued", deliveryStatus: "unknown" },
      ];
      for (const [index, status] of statuses.entries()) {
        await insertNotificationHistoryFixture(ctx, {
          shopId,
          staffId,
          requestedAt: Date.now() + index,
          ...status,
        });
      }
      return { shopId, staffId };
    });

    const page = await t
      .withIdentity({ subject: "history_query_status" })
      .query(api.notificationOutbox.queries.listStaffNotificationHistory, {
        shopId: ids.shopId,
        staffId: ids.staffId,
        paginationOpts: { numItems: 20, cursor: null },
      });
    expect(Object.fromEntries(page.page.map((history) => [history.displayTitle, history.displayStatus]))).toEqual({
      cancelled: "cancelled",
      delivered: "delivered",
      delayed: "delayed",
      "provider-failed": "failed",
      "send-failed": "failed",
      sent: "sent",
      queued: "queued",
    });
  });

  it("listOpenFailuresは同一店舗のopen失敗だけをlastFailedAt降順で返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const primary = await seedManagerShop(ctx, {
        subject: "manager_primary",
        email: "primary@example.com",
        shopName: "主店舗",
      });
      const other = await seedManagerShop(ctx, {
        subject: "manager_other",
        email: "other@example.com",
        shopName: "別店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: primary.shopId,
        name: "不達スタッフ",
        email: "failure@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: primary.shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const confirmedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: primary.shopId,
        periodStart: "2026-07-16",
        periodEnd: "2026-07-31",
        deadline: "2026-07-10",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const oldFailureId = await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:old",
        status: "open",
        dedupeKey: "email:test:old",
        lastFailedAt: Date.now() - 1000,
        notificationContext: "notification.sendReminderEmails",
      });
      // 種別「通知」(other) は一覧から除外される（最新だが表示されない）
      await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:other-kind",
        status: "open",
        dedupeKey: "email:test:other-kind",
        lastFailedAt: Date.now() + 1000,
        notificationContext: "test.email",
      });
      const newFailureId = await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:new",
        status: "open",
        dedupeKey: "email:test:new",
        lastFailedAt: Date.now(),
        staffId,
        recruitmentId,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:confirmed-recruitment",
        status: "open",
        dedupeKey: "email:test:confirmed-recruitment",
        lastFailedAt: Date.now() + 2000,
        staffId,
        recruitmentId: confirmedRecruitmentId,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:retrying",
        status: "retrying",
        dedupeKey: "email:test:retrying",
      });
      await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:resolved",
        status: "resolved",
        dedupeKey: "email:test:resolved",
      });
      await insertFailure(ctx, {
        shopId: other.shopId,
        failureKey: "outbox:other",
        status: "open",
        dedupeKey: "email:test:other",
      });
      return { oldFailureId, newFailureId, shopId: primary.shopId };
    });

    const page = await t
      .withIdentity({ subject: "manager_primary" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        shopId: ids.shopId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(page.page.map((failure) => failure._id)).toEqual([ids.newFailureId, ids.oldFailureId]);
    expect(page.page[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      channel: "email",
      dedupeKey: "email:test:new",
      notificationContext: "notification.sendRecruitmentNotificationEmails",
      notificationKind: "recruitment",
      notificationKindLabel: "シフト募集通知",
      staffName: "不達スタッフ",
      periodLabel: "7/1(水)〜7/15(水)",
      canRetry: false,
    });
    expect(page.page[0]).not.toHaveProperty("payload");
    expect(page.page[0]).not.toHaveProperty("lastError");
  });

  it("listOpenFailuresは非表示失敗がページを埋めても対応可能な失敗を初回ページで返す", async () => {
    const t = convexTest(schema, modules);
    const { actionableId, shopId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "manager_pagination",
        email: "pagination@example.com",
        shopName: "ページング店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "ページングスタッフ",
        email: "pagination-staff@example.com",
        isDeleted: false,
      });
      const openRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const confirmedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-16",
        periodEnd: "2026-07-31",
        deadline: "2026-07-10",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      // 対応可能な失敗（古い）
      const id = await insertFailure(ctx, {
        shopId,
        failureKey: "outbox:actionable",
        status: "open",
        dedupeKey: "email:test:actionable",
        lastFailedAt: Date.now() - 10_000,
        staffId,
        recruitmentId: openRecruitmentId,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      // 募集終了済み失敗（新しい）でページ先頭を埋める
      for (let i = 0; i < 3; i++) {
        await insertFailure(ctx, {
          shopId,
          failureKey: `outbox:confirmed-recruitment-${i}`,
          status: "open",
          dedupeKey: `email:test:confirmed-recruitment-${i}`,
          lastFailedAt: Date.now() + i + 100,
          staffId,
          recruitmentId: confirmedRecruitmentId,
          notificationContext: "notification.sendRecruitmentNotificationEmails",
        });
      }
      // other失敗（新しい）はDB filterで除外される
      for (let i = 0; i < 3; i++) {
        await insertFailure(ctx, {
          shopId,
          failureKey: `outbox:other-${i}`,
          status: "open",
          dedupeKey: `email:test:other-${i}`,
          lastFailedAt: Date.now() + i,
          notificationContext: "test.email",
        });
      }
      return { actionableId: id, shopId };
    });

    const page = await t
      .withIdentity({ subject: "manager_pagination" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        shopId,
        paginationOpts: { numItems: 1, cursor: null },
      });

    expect(page.page.map((failure) => failure._id)).toEqual([actionableId]);
  });

  it("hasOpenFailuresは現在店舗のopen失敗の有無だけを返す", async () => {
    const t = convexTest(schema, modules);
    const shopIds = await t.run(async (ctx) => {
      const active = await seedManagerShop(ctx, {
        subject: "manager_active",
        email: "active@example.com",
        shopName: "失敗あり店舗",
      });
      const empty = await seedManagerShop(ctx, {
        subject: "manager_empty",
        email: "empty@example.com",
        shopName: "失敗なし店舗",
      });
      const otherKindOnly = await seedManagerShop(ctx, {
        subject: "manager_other_kind",
        email: "other-kind@example.com",
        shopName: "通知種別のみ店舗",
      });
      const closedOnly = await seedManagerShop(ctx, {
        subject: "manager_closed_only",
        email: "closed-only@example.com",
        shopName: "募集終了のみ店舗",
      });
      await insertFailure(ctx, {
        shopId: active.shopId,
        failureKey: "outbox:active",
        status: "open",
        dedupeKey: "email:test:active",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      // 種別「通知」(other) しかない店舗は要対応なし扱い
      await insertFailure(ctx, {
        shopId: otherKindOnly.shopId,
        failureKey: "outbox:other-kind-only",
        status: "open",
        dedupeKey: "email:test:other-kind-only",
        notificationContext: "test.email",
      });
      const closedRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: closedOnly.shopId,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        deadline: "2026-06-25",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await insertFailure(ctx, {
        shopId: closedOnly.shopId,
        failureKey: "outbox:closed-only",
        status: "open",
        dedupeKey: "email:test:closed-only",
        recruitmentId: closedRecruitmentId,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      return {
        active: active.shopId,
        empty: empty.shopId,
        otherKind: otherKindOnly.shopId,
        closedOnly: closedOnly.shopId,
      };
    });

    await expect(
      t
        .withIdentity({ subject: "manager_active" })
        .query(api.notificationOutbox.queries.hasOpenFailures, { shopId: shopIds.active }),
    ).resolves.toBe(true);
    await expect(
      t
        .withIdentity({ subject: "manager_empty" })
        .query(api.notificationOutbox.queries.hasOpenFailures, { shopId: shopIds.empty }),
    ).resolves.toBe(false);
    await expect(
      t
        .withIdentity({ subject: "manager_other_kind" })
        .query(api.notificationOutbox.queries.hasOpenFailures, { shopId: shopIds.otherKind }),
    ).resolves.toBe(false);
    await expect(
      t
        .withIdentity({ subject: "manager_closed_only" })
        .query(api.notificationOutbox.queries.hasOpenFailures, { shopId: shopIds.closedOnly }),
    ).resolves.toBe(false);
  });
});

async function insertFailure(
  ctx: { db: DatabaseWriter },
  args: {
    shopId: Id<"shops">;
    failureKey: string;
    status: "open" | "retrying" | "resolved";
    dedupeKey: string;
    lastFailedAt?: number;
    staffId?: Id<"staffs">;
    recruitmentId?: Id<"recruitments">;
    notificationContext?: string;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: args.failureKey,
    sourceType: "outbox",
    status: args.status,
    shopId: args.shopId,
    ...(args.staffId ? { staffId: args.staffId } : {}),
    ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
    channel: "email",
    dedupeKey: args.dedupeKey,
    notificationContext: args.notificationContext ?? "test.email",
    firstFailedAt: args.lastFailedAt ?? now,
    lastFailedAt: args.lastFailedAt ?? now,
    lastError: "failed",
    createdAt: now,
    updatedAt: now,
  });
}

async function insertNotificationHistoryFixture(
  ctx: { db: DatabaseWriter },
  args: {
    shopId: Id<"shops">;
    staffId: Id<"staffs">;
    requestedAt: number;
    sentAt?: number;
    displayTitle: string;
    sendStatus: Doc<"notificationHistory">["sendStatus"];
    deliveryStatus: Doc<"notificationHistory">["deliveryStatus"];
  },
) {
  const outboxId = await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: "sent",
    dedupeKey: `email:test:history-query:${args.displayTitle}:${args.requestedAt}`,
    shopId: args.shopId,
    staffId: args.staffId,
    payload: {
      kind: "email",
      from: "シフトリ <noreply@example.com>",
      to: "sensitive-recipient@example.com",
      subject: args.displayTitle,
      html: "<p>token付きURLを含み得る本文</p>",
      context: "test.historyQuery",
    },
    attemptCount: 1,
    nextRunAt: args.requestedAt,
    ...(args.sentAt !== undefined ? { sentAt: args.sentAt } : {}),
    createdAt: args.requestedAt,
    updatedAt: args.requestedAt,
  });

  return await ctx.db.insert("notificationHistory", {
    outboxId,
    shopId: args.shopId,
    staffId: args.staffId,
    channel: "email",
    notificationKind: "test.historyQuery",
    displayTitle: args.displayTitle,
    sendStatus: args.sendStatus,
    deliveryStatus: args.deliveryStatus,
    requestedAt: args.requestedAt,
    ...(args.sentAt !== undefined ? { sentAt: args.sentAt } : {}),
    updatedAt: args.requestedAt,
  });
}

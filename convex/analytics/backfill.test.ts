import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ANALYTICS_METRICS, notificationMetric } from "./metrics";

const DAY1 = "2026-07-01";
const DAY2 = "2026-07-02";
const DAY3 = "2026-07-03";
const REMINDER_METRIC = notificationMetric("email", "sent", "reminder");

function setup() {
  return convexTest(schema, modules);
}

type T = ReturnType<typeof setup>;

function noonOf(date: string) {
  return jstDayRangeMs(date).startMs + 12 * 60 * 60 * 1000;
}

let dedupeSeq = 0;

async function insertSentReminder(ctx: MutationCtx, shopId: Id<"shops">, at: number) {
  dedupeSeq += 1;
  return await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: "sent",
    dedupeKey: `test:${dedupeSeq}`,
    shopId,
    payload: {
      kind: "email",
      from: "シフトリ <noreply@example.com>",
      to: "staff@example.com",
      subject: "テスト",
      html: "<p>test</p>",
      context: "notification.sendReminderEmails",
    },
    attemptCount: 1,
    nextRunAt: at,
    createdAt: at,
    updatedAt: at,
    sentAt: at,
  });
}

async function getEventCount(t: T, date: string, metric: string) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("analyticsDailyEventCounts")
      .withIndex("by_date_metric", (q) => q.eq("date", date).eq("metric", metric))
      .first();
  });
}

describe("analytics/backfill", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("最古の店舗作成日から前日まで、イベント系KPIだけを日別に復元する", async () => {
    const t = setup();

    // DAY1: 店舗作成 + 催促メール1件
    vi.setSystemTime(new Date(noonOf(DAY1)));
    const shopId = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      await insertSentReminder(ctx, shopId, noonOf(DAY1));
      return shopId;
    });

    // DAY2: 催促メール2件 + スタッフ作成1名
    vi.setSystemTime(new Date(noonOf(DAY2)));
    await t.run(async (ctx) => {
      await insertSentReminder(ctx, shopId, noonOf(DAY2));
      await insertSentReminder(ctx, shopId, noonOf(DAY2) + 1000);
      await ctx.db.insert("staffs", { shopId, name: "スタッフ", email: "staff@example.com", isDeleted: false });
    });

    // DAY4 に実行 → fromDate 既定値 = 最古の店舗作成日(DAY1)、toDate 既定値 = 前日(DAY3)
    vi.setSystemTime(new Date(noonOf(DAY3) + 24 * 60 * 60 * 1000));
    const result = await t.mutation(internal.analytics.backfill.start, {});
    expect(result).toMatchObject({ started: true, fromDate: DAY1, toDate: DAY3 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await getEventCount(t, DAY1, REMINDER_METRIC)).toMatchObject({ count: 1 });
    expect(await getEventCount(t, DAY2, REMINDER_METRIC)).toMatchObject({ count: 2 });
    // イベントゼロの日も0行が書かれる（「未集計」と「0件」の区別）
    expect(await getEventCount(t, DAY3, REMINDER_METRIC)).toMatchObject({ count: 0 });
    expect(await getEventCount(t, DAY1, ANALYTICS_METRICS.shopCreated)).toMatchObject({ count: 1 });
    expect(await getEventCount(t, DAY2, ANALYTICS_METRICS.staffCreated)).toMatchObject({ count: 1 });

    // 状態スナップショット（Phase 1〜2）はバックフィル対象外
    const shopSnapshots = await t.run(async (ctx) => await ctx.db.query("analyticsDailyShopSnapshots").collect());
    const serviceSnapshots = await t.run(async (ctx) => await ctx.db.query("analyticsDailyServiceSnapshots").collect());
    expect(shopSnapshots).toHaveLength(0);
    expect(serviceSnapshots).toHaveLength(0);

    // 再実行しても値は変わらず、行も重複しない（絶対値upsertの冪等性）
    await t.mutation(internal.analytics.backfill.start, { fromDate: DAY1, toDate: DAY3 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await getEventCount(t, DAY2, REMINDER_METRIC)).toMatchObject({ count: 2 });
    const day2Rows = await t.run(async (ctx) => {
      return await ctx.db
        .query("analyticsDailyEventCounts")
        .withIndex("by_date_metric", (q) => q.eq("date", DAY2).eq("metric", REMINDER_METRIC))
        .collect();
    });
    expect(day2Rows).toHaveLength(1);
  });

  it("店舗が1つもない場合は開始しない", async () => {
    const t = setup();
    vi.setSystemTime(new Date(noonOf(DAY3)));
    const result = await t.mutation(internal.analytics.backfill.start, {});
    expect(result).toMatchObject({ started: false });
  });

  it("fromDate が toDate より後なら開始しない", async () => {
    const t = setup();
    vi.setSystemTime(new Date(noonOf(DAY3)));
    await t.run(async (ctx) => {
      await seedShop(ctx);
    });
    const result = await t.mutation(internal.analytics.backfill.start, { fromDate: DAY3, toDate: DAY1 });
    expect(result).toMatchObject({ started: false });
  });
});

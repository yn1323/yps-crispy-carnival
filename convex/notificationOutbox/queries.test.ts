import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { DatabaseWriter } from "../_generated/server";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notificationOutbox/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

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
      const oldFailureId = await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:old",
        status: "open",
        dedupeKey: "email:test:old",
        lastFailedAt: Date.now() - 1000,
      });
      const newFailureId = await insertFailure(ctx, {
        shopId: primary.shopId,
        failureKey: "outbox:new",
        status: "open",
        dedupeKey: "email:test:new",
        lastFailedAt: Date.now(),
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
      return { oldFailureId, newFailureId };
    });

    const page = await t
      .withIdentity({ subject: "manager_primary" })
      .query(api.notificationOutbox.queries.listOpenFailures, {
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(page.page.map((failure) => failure._id)).toEqual([ids.newFailureId, ids.oldFailureId]);
    expect(page.page[0]).toMatchObject({
      sourceType: "outbox",
      status: "open",
      channel: "email",
      dedupeKey: "email:test:new",
      notificationContext: "test.email",
      canRetry: false,
    });
    expect(page.page[0]).not.toHaveProperty("payload");
  });

  it("hasOpenFailuresは現在店舗のopen失敗の有無だけを返す", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const active = await seedManagerShop(ctx, {
        subject: "manager_active",
        email: "active@example.com",
        shopName: "失敗あり店舗",
      });
      await seedManagerShop(ctx, {
        subject: "manager_empty",
        email: "empty@example.com",
        shopName: "失敗なし店舗",
      });
      await insertFailure(ctx, {
        shopId: active.shopId,
        failureKey: "outbox:active",
        status: "open",
        dedupeKey: "email:test:active",
      });
    });

    await expect(
      t.withIdentity({ subject: "manager_active" }).query(api.notificationOutbox.queries.hasOpenFailures, {}),
    ).resolves.toBe(true);
    await expect(
      t.withIdentity({ subject: "manager_empty" }).query(api.notificationOutbox.queries.hasOpenFailures, {}),
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
  },
) {
  const now = Date.now();
  return await ctx.db.insert("notificationFailureInbox", {
    failureKey: args.failureKey,
    sourceType: "outbox",
    status: args.status,
    shopId: args.shopId,
    channel: "email",
    dedupeKey: args.dedupeKey,
    notificationContext: "test.email",
    firstFailedAt: args.lastFailedAt ?? now,
    lastFailedAt: args.lastFailedAt ?? now,
    lastError: "failed",
    createdAt: now,
    updatedAt: now,
  });
}

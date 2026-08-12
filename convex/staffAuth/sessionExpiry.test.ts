import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE } from "../constants";

const NOW = new Date("2026-01-10T00:00:00+09:00").getTime();

async function seedViewMagicLink(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "session期限テスト店舗");
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "session期限スタッフ",
      email: "session-expiry@example.com",
      emailNormalized: "session-expiry@example.com",
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-02-01",
      periodEnd: "2026-02-07",
      deadline: "2026-01-29",
      shopClosedDates: [],
      status: "confirmed",
      confirmedAt: NOW,
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    const token = "session-expiry-magic-link";
    await ctx.db.insert("magicLinks", {
      token,
      staffId,
      shopId,
      recruitmentId,
      accessKind: "view",
      expiresAt: NOW + 24 * 60 * 60 * 1000,
    });
    return { token, staffId, shopId, recruitmentId };
  });
}

describe("staff sessionの期限materialization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("session作成と同じtransactionでexpiresAtの期限処理を1件予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedViewMagicLink(t);

    const verified = await t.mutation(api.staffAuth.mutations.verifyToken, {
      token: ids.token,
      accessKind: "view",
    });
    expect(verified.status).toBe("ok");
    if (verified.status !== "ok") throw new Error("session was not issued");

    const state = await t.run(async (ctx) => {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_sessionToken", (q) => q.eq("sessionToken", verified.sessionToken))
        .unique();
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return { session, jobs: jobs.filter((job) => job.name === "staffAuth/mutations:expireSession") };
    });
    expect(state.session).not.toBeNull();
    if (!state.session) throw new Error("session was not persisted");
    expect(state.jobs.map((job) => ({ scheduledTime: job.scheduledTime, args: job.args[0] }))).toEqual([
      {
        scheduledTime: state.session.expiresAt,
        args: { sessionId: state.session._id, expectedExpiresAt: state.session.expiresAt },
      },
    ]);
  });

  it("expectedExpiresAt不一致と期限前は削除せず、期限後の重複実行は冪等になる", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedViewMagicLink(t);
    const expiresAt = NOW + 1_000;
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert("sessions", {
        sessionToken: "expected-expiry-session",
        staffId: ids.staffId,
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        accessKind: "view",
        expiresAt,
      }),
    );

    await expect(
      t.mutation(internal.staffAuth.mutations.expireSession, { sessionId, expectedExpiresAt: expiresAt }),
    ).resolves.toEqual({ changed: false });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(
      t.mutation(internal.staffAuth.mutations.expireSession, { sessionId, expectedExpiresAt: expiresAt + 1 }),
    ).resolves.toEqual({ changed: false });
    expect(await t.run((ctx) => ctx.db.get(sessionId))).not.toBeNull();

    await expect(
      t.mutation(internal.staffAuth.mutations.expireSession, { sessionId, expectedExpiresAt: expiresAt }),
    ).resolves.toEqual({ changed: true });
    await expect(
      t.mutation(internal.staffAuth.mutations.expireSession, { sessionId, expectedExpiresAt: expiresAt }),
    ).resolves.toEqual({ changed: false });
  });

  it("予約漏れsessionをbounded batchで削除し、満杯なら継続してbacklogを回収する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedViewMagicLink(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE + 2; index += 1) {
        await ctx.db.insert("sessions", {
          sessionToken: `legacy-expired-session-${index}`,
          staffId: ids.staffId,
          shopId: ids.shopId,
          recruitmentId: ids.recruitmentId,
          accessKind: "view",
          expiresAt: NOW - index,
          ...(index === 0 ? { revokedAt: NOW - 10 } : {}),
        });
      }
      await ctx.db.insert("sessions", {
        sessionToken: "future-session",
        staffId: ids.staffId,
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        accessKind: "view",
        expiresAt: NOW + 60_000,
      });
    });

    await expect(t.mutation(internal.staffAuth.mutations.recoverExpiredSessions, {})).resolves.toEqual({
      deletedCount: STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE,
      continuationScheduled: true,
    });
    const continuationJobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.name === "staffAuth/mutations:recoverExpiredSessions",
      ),
    );
    expect(continuationJobs.map((job) => job.args[0])).toEqual([{}]);

    await vi.advanceTimersByTimeAsync(0);
    await t.finishInProgressScheduledFunctions();
    const remaining = await t.run(async (ctx) => ctx.db.query("sessions").collect());
    expect(remaining.map((session) => session.sessionToken)).toEqual(["future-session"]);
    await expect(t.mutation(internal.staffAuth.mutations.recoverExpiredSessions, {})).resolves.toEqual({
      deletedCount: 0,
      continuationScheduled: false,
    });
  });
});

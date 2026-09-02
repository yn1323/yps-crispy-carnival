import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { STAFF_SESSION_TTL_MS } from "../constants";

const NOW = new Date("2026-07-01T00:00:00.000Z").getTime();

async function seedShiftViewCapability() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "期限反映シナリオ店舗");
    const staffId = await seedStaff(ctx, {
      shopId,
      name: "期限反映スタッフ",
      email: "session-scenario@example.com",
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-07-20",
      periodEnd: "2026-07-26",
      deadline: "2026-07-17",
      shopClosedDates: [],
      status: "confirmed",
      confirmedAt: NOW,
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    const token = "staff-session-expiry-scenario-link";
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
  return { t, ids };
}

describe("スタッフsession期限の状態遷移", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("発行済みsessionは期限到来のscheduled mutationで削除され、公開queryが利用不可へ変わる", async () => {
    const { t, ids } = await seedShiftViewCapability();
    const verified = await t.mutation(api.staffAuth.mutations.verifyToken, {
      token: ids.token,
      accessKind: "view",
    });
    expect(verified.status).toBe("ok");
    if (verified.status !== "ok") throw new Error("session was not issued");

    await expect(
      t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken: verified.sessionToken,
        accessKind: "view",
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.not.toBeNull();

    await vi.advanceTimersByTimeAsync(STAFF_SESSION_TTL_MS);
    await t.finishInProgressScheduledFunctions();

    await expect(
      t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken: verified.sessionToken,
        accessKind: "view",
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();
    const storedSession = await t.run(async (ctx) =>
      ctx.db
        .query("sessions")
        .withIndex("by_sessionToken", (q) => q.eq("sessionToken", verified.sessionToken))
        .unique(),
    );
    expect(storedSession).toBeNull();
  });

  it("有効sessionでもstaffと人物のuserが不一致なら閲覧を閉じ、副作用を作らない", async () => {
    const { t, ids } = await seedShiftViewCapability();
    const verified = await t.mutation(api.staffAuth.mutations.verifyToken, {
      token: ids.token,
      accessKind: "view",
    });
    expect(verified.status).toBe("ok");
    if (verified.status !== "ok") throw new Error("session was not issued");

    await t.run(async (ctx) => {
      const staff = await ctx.db.get(ids.staffId);
      if (!staff?.organizationPersonId) throw new Error("staff canonical person was not found");
      const [staffUserId, personUserId] = await Promise.all([
        seedUser(ctx, "session_mismatched_staff_user"),
        seedUser(ctx, "session_mismatched_person_user"),
      ]);
      await ctx.db.patch(staff._id, { userId: staffUserId });
      await ctx.db.patch(staff.organizationPersonId, { userId: personUserId, updatedAt: NOW });
    });
    const snapshot = async () =>
      await t.run(async (ctx) => ({
        sessionIds: (await ctx.db.query("sessions").collect()).map(({ _id }) => _id),
        scheduledIds: (await ctx.db.system.query("_scheduled_functions").collect()).map(({ _id }) => _id),
        outboxIds: (await ctx.db.query("notificationOutbox").collect()).map(({ _id }) => _id),
      }));
    const before = await snapshot();

    await expect(
      t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken: verified.sessionToken,
        accessKind: "view",
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();

    await expect(snapshot()).resolves.toEqual(before);
  });

  it("期限予約のない既存sessionもrecoveryで物理削除される", async () => {
    const { t, ids } = await seedShiftViewCapability();
    const sessionToken = "legacy-session-without-expiry-job";
    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        sessionToken,
        staffId: ids.staffId,
        shopId: ids.shopId,
        recruitmentId: ids.recruitmentId,
        accessKind: "view",
        expiresAt: NOW + 1_000,
      });
    });
    await expect(
      t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken,
        accessKind: "view",
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.not.toBeNull();

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(t.mutation(internal.staffAuth.mutations.recoverExpiredSessions, {})).resolves.toEqual({
      deletedCount: 1,
      continuationScheduled: false,
    });
    await expect(
      t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken,
        accessKind: "view",
        recruitmentId: ids.recruitmentId,
      }),
    ).resolves.toBeNull();
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
          .unique(),
      ),
    ).toBeNull();
  });
});

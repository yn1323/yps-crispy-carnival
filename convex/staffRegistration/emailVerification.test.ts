import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  STAFF_REGISTRATION_VERIFICATION_PRUNE_BATCH_SIZE,
  STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
  STAFF_REGISTRATION_VERIFICATION_RETENTION_AFTER_EXPIRY_MS,
} from "../constants";

type Test = TestConvex<typeof schema>;

async function seedShopId(t: Test, suffix: string): Promise<Id<"shops">> {
  return await t.run(
    async (ctx) =>
      (await seedManagerShop(ctx, { subject: `verification_${suffix}`, email: `${suffix}@example.com` })).shopId,
  );
}

async function seedVerification(
  t: Test,
  shopId: Id<"shops">,
  key: string,
  overrides: { codeExpiresAt: number; sendCount?: number; lastSentAt?: number },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("staffRegistrationEmailVerifications", {
        shopId,
        name: `確認待ち ${key}`,
        email: `${key}@example.com`,
        emailNormalized: `${key}@example.com`,
        termsConsentVersion: "2026-01-01",
        privacyConsentVersion: "2026-01-01",
        termsDocumentVersion: "2026-01-01",
        privacyDocumentVersion: "2026-01-01",
        handleDigest: `handle-${key}`,
        codeDigest: `code-${key}`,
        codeExpiresAt: overrides.codeExpiresAt,
        failedAttemptCount: 0,
        sendCount: overrides.sendCount ?? 1,
        lastSentAt: overrides.lastSentAt ?? Date.now(),
        createdAt: Date.now(),
      }),
  );
}

async function readVerifications(t: Test) {
  return await t.run(async (ctx) => await ctx.db.query("staffRegistrationEmailVerifications").collect());
}

describe("staffRegistration/emailVerification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("pruneExpired", () => {
    it("期限切れから保持時間を過ぎた確認待ちだけを削除し、もう一度実行しても結果は変わらない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await seedShopId(t, "prune_boundary");
      const cutoff = Date.now() - STAFF_REGISTRATION_VERIFICATION_RETENTION_AFTER_EXPIRY_MS;
      await seedVerification(t, shopId, "past-retention", { codeExpiresAt: cutoff - 1 });
      const atBoundary = await seedVerification(t, shopId, "at-boundary", { codeExpiresAt: cutoff });
      const stillValid = await seedVerification(t, shopId, "still-valid", { codeExpiresAt: Date.now() + 1 });

      await t.mutation(internal.staffRegistration.emailVerification.pruneExpired, {});
      const afterFirstRun = (await readVerifications(t)).map((verification) => verification._id);
      await t.mutation(internal.staffRegistration.emailVerification.pruneExpired, {});

      expect(afterFirstRun).toEqual([atBoundary, stillValid]);
      expect((await readVerifications(t)).map((verification) => verification._id)).toEqual([atBoundary, stillValid]);
      await expect(t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).resolves.toEqual(
        [],
      );
    });

    it("1回で削除しきれない件数は、続きの削除を1件だけ予約して最後まで消す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await seedShopId(t, "prune_batch");
      const expiredAt = Date.now() - STAFF_REGISTRATION_VERIFICATION_RETENTION_AFTER_EXPIRY_MS - 1;
      for (let index = 0; index <= STAFF_REGISTRATION_VERIFICATION_PRUNE_BATCH_SIZE; index += 1) {
        await seedVerification(t, shopId, `batch-${index}`, { codeExpiresAt: expiredAt });
      }

      await t.mutation(internal.staffRegistration.emailVerification.pruneExpired, {});

      await expect(readVerifications(t)).resolves.toHaveLength(1);
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.map((job) => ({ name: job.name, args: job.args }))).toEqual([
        { name: "staffRegistration/emailVerification:pruneExpired", args: [{}] },
      ]);

      vi.advanceTimersByTime(0);
      await t.finishInProgressScheduledFunctions();
      await expect(readVerifications(t)).resolves.toEqual([]);
    });
  });

  describe("releaseFailedSend", () => {
    it("初回の送信に失敗した確認待ちは削除し、ほかの確認待ちには触れない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await seedShopId(t, "release_first");
      await seedVerification(t, shopId, "failed", { codeExpiresAt: Date.now() + 1_000 });
      const other = await seedVerification(t, shopId, "other", { codeExpiresAt: Date.now() + 1_000 });

      await t.mutation(internal.staffRegistration.emailVerification.releaseFailedSend, {
        handleDigest: "handle-failed",
      });

      expect((await readVerifications(t)).map((verification) => verification._id)).toEqual([other]);
    });

    it("再送に失敗した確認待ちは残し、届いていないコードを無効にして送信間隔だけを解除する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await seedShopId(t, "release_resend");
      const now = Date.now();
      await seedVerification(t, shopId, "resent", { codeExpiresAt: now + 1_000, sendCount: 2, lastSentAt: now });

      await t.mutation(internal.staffRegistration.emailVerification.releaseFailedSend, {
        handleDigest: "handle-resent",
      });

      expect(
        (await readVerifications(t)).map(({ sendCount, lastSentAt, codeExpiresAt }) => ({
          sendCount,
          lastSentAt,
          codeExpiresAt,
        })),
      ).toEqual([
        {
          sendCount: 2,
          lastSentAt: now - STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
          codeExpiresAt: now,
        },
      ]);
    });

    it("存在しない引換tokenでは何も変えない", async () => {
      const t = convexTest(schema, modules);
      const shopId = await seedShopId(t, "release_unknown");
      const kept = await seedVerification(t, shopId, "kept", { codeExpiresAt: Date.now() + 1_000 });

      await t.mutation(internal.staffRegistration.emailVerification.releaseFailedSend, {
        handleDigest: "handle-unknown",
      });

      expect((await readVerifications(t)).map((verification) => verification._id)).toEqual([kept]);
    });
  });
});

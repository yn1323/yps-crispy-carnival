import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

/** テスト用データセットアップ */
async function setupTestData(t: TestConvex<typeof schema>) {
  const magicLinkToken = "test-token-valid";

  const result = await t.run(async (ctx) => {
    const shopId = await ctx.db.insert("shops", {
      name: "テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "user_owner",
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-01-20",
      periodEnd: "2026-01-26",
      deadline: "2026-01-17",
      status: "confirmed",
      confirmedAt: Date.now(),
      isDeleted: false,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    await ctx.db.insert("magicLinks", {
      token: magicLinkToken,
      staffId,
      shopId,
      recruitmentId,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    return { shopId, recruitmentId, staffId };
  });

  return { ...result, magicLinkToken };
}

describe("staffAuth/mutations", () => {
  describe("verifyToken", () => {
    it("有効なトークンでセッションが作成される", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.sessionToken).toBeDefined();
        expect(result.recruitmentId).toBe(recruitmentId);
      }
    });

    it("有効なトークンでセッションが14日後に期限切れになる", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        // セッションのexpiresAtを検証
        await t.run(async (ctx) => {
          const session = await ctx.db
            .query("sessions")
            .withIndex("by_sessionToken", (q) => q.eq("sessionToken", result.sessionToken))
            .first();
          if (!session) throw new Error("session not found");
          const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
          const diff = session.expiresAt - Date.now();
          // 14日±1分の範囲
          expect(diff).toBeGreaterThan(fourteenDaysMs - 60000);
          expect(diff).toBeLessThanOrEqual(fourteenDaysMs);
        });
      }
    });

    it("使用済みトークンはexpiredが返る（ワンタイム）", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t);

      const result1 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
      });
      const result2 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
      });

      expect(result1.status).toBe("ok");
      expect(result2.status).toBe("expired");
    });

    it("期限切れトークンでexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId } = await setupTestData(t);

      // 期限切れトークンを作成
      // biome-ignore lint/suspicious/noExplicitAny: t.run の ctx 型推論が効かないため
      await t.run(async (ctx: any) => {
        await ctx.db.insert("magicLinks", {
          token: "expired-token",
          staffId,
          shopId,
          recruitmentId,
          expiresAt: Date.now() - 1000,
        });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: "expired-token",
      });

      expect(result.status).toBe("expired");
      expect(result.recruitmentId).toBe(recruitmentId);
    });

    it("存在しないトークンでexpiredが返る", async () => {
      const t = convexTest(schema, modules);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: "nonexistent-token",
      });

      expect(result.status).toBe("expired");
      expect(result.recruitmentId).toBeNull();
    });
  });

  describe("verifyToken レートリミット", () => {
    it("同じキーで6回連続呼び出すと rate_limited が返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t);

      // capacity 5 なので5回目までは通る（status は ok or expired）
      for (let i = 0; i < 5; i++) {
        const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
          token: magicLinkToken,
        });
        expect(result.status).not.toBe("rate_limited");
      }

      // 6回目でレートリミット
      const result6 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
      });
      expect(result6.status).toBe("rate_limited");
      if (result6.status === "rate_limited") {
        expect(result6.retryAfter).toBeGreaterThan(Date.now() - 1000);
        expect(result6.recruitmentId).toBeNull();
      }
    });

    it("異なるトークンプレフィックスは独立してカウントされる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId } = await setupTestData(t);

      // 先頭8文字が異なるトークンを2つ作成
      await t.run(async (ctx) => {
        await ctx.db.insert("magicLinks", {
          token: "aaaaaaaa-token-1",
          staffId,
          shopId,
          recruitmentId,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        await ctx.db.insert("magicLinks", {
          token: "bbbbbbbb-token-2",
          staffId,
          shopId,
          recruitmentId,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
      });

      // 各トークンで5回ずつ呼んでもレートリミットされない
      for (let i = 0; i < 5; i++) {
        const resultA = await t.mutation(api.staffAuth.mutations.verifyToken, {
          token: "aaaaaaaa-token-1",
        });
        expect(resultA.status).not.toBe("rate_limited");
      }
      for (let i = 0; i < 5; i++) {
        const resultB = await t.mutation(api.staffAuth.mutations.verifyToken, {
          token: "bbbbbbbb-token-2",
        });
        expect(resultB.status).not.toBe("rate_limited");
      }
    });
  });

  describe("requestReissue", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未登録メールでもエラーを投げない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, {
          email: "unknown@example.com",
          recruitmentId,
        }),
      ).resolves.not.toThrow();
    });

    it("有効なメール+recruitmentでエラーを投げない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, {
          email: "suzuki@example.com",
          recruitmentId,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("requestReissue レートリミット", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("4回連続呼び出しでもエラーにならない（レートリミット時もvoid）", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      for (let i = 0; i < 4; i++) {
        await expect(
          t.mutation(api.staffAuth.mutations.requestReissue, {
            email: "suzuki@example.com",
            recruitmentId,
          }),
        ).resolves.not.toThrow();
      }
    });
  });
});

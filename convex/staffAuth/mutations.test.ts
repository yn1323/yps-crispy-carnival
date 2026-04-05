import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
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

  describe("requestReissue", () => {
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
});

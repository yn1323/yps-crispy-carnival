import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

/** テスト用にshop + staff + recruitment + sessionをセットアップ */
async function setupTestData(t: TestConvex<typeof schema>, options?: { deadlinePassed?: boolean }) {
  return await t.run(async (ctx) => {
    const shopId = await ctx.db.insert("shops", {
      name: "テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "user_owner",
      isDeleted: false,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-04-07",
      periodEnd: "2026-04-13",
      deadline: options?.deadlinePassed ? "2026-01-01" : "2026-12-31",
      status: "open",
      isDeleted: false,
    });
    const sessionToken = "test-session-token";
    await ctx.db.insert("sessions", {
      sessionToken,
      staffId,
      shopId,
      recruitmentId,
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
    });
    return { shopId, staffId, recruitmentId, sessionToken };
  });
}

const validRequests = [
  { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
];

describe("shiftSubmission/mutations", () => {
  describe("submitShiftRequests", () => {
    it("セッション期限切れでエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      // 期限切れセッションを作成
      const expiredToken = await t.run(async (ctx) => {
        const token = "expired-token";
        const staff = await ctx.db.query("staffs").first();
        const shop = await ctx.db.query("shops").first();
        if (!staff || !shop) throw new Error("Test setup failed");
        await ctx.db.insert("sessions", {
          sessionToken: token,
          staffId: staff._id,
          shopId: shop._id,
          recruitmentId,
          expiresAt: Date.now() - 1000,
        });
        return token;
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken: expiredToken,
          recruitmentId,
          requests: [],
        }),
      ).rejects.toThrow("Session expired");
    });

    it("recruitmentId不一致でエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, shopId } = await setupTestData(t);

      const otherRecruitmentId = await t.run(async (ctx) =>
        ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          deadline: "2026-12-31",
          status: "open",
          isDeleted: false,
        }),
      );

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          recruitmentId: otherRecruitmentId,
          requests: [],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("締切超過でエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, { deadlinePassed: true });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          recruitmentId,
          requests: [],
        }),
      ).rejects.toThrow("Deadline passed");
    });

    it("正常にシフト希望を提出できる", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        recruitmentId,
        requests: validRequests,
      });

      const [requests, submission] = await t.run(async (ctx) => {
        const reqs = await ctx.db
          .query("shiftRequests")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const sub = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first();
        return [reqs, sub] as const;
      });

      expect(requests).toHaveLength(2);
      expect(requests[0].date).toBe("2026-04-07");
      expect(submission).not.toBeNull();
      expect(submission?.submittedAt).toBeTypeOf("number");
    });

    it("全休み提出（空配列）でshiftSubmissionのみ作成", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        recruitmentId,
        requests: [],
      });

      const [requests, submission] = await t.run(async (ctx) => {
        const reqs = await ctx.db
          .query("shiftRequests")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const sub = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first();
        return [reqs, sub] as const;
      });

      expect(requests).toHaveLength(0);
      expect(submission).not.toBeNull();
    });

    it("再提出で既存データを置き換え＋submittedAt更新", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);

      // 初回提出
      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        recruitmentId,
        requests: validRequests,
      });

      const firstSubmission = await t.run(async (ctx) =>
        ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first(),
      );

      // 再提出（1件のみ）
      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        recruitmentId,
        requests: [{ date: "2026-04-10", startTime: "10:00", endTime: "20:00" }],
      });

      const [requests, submission] = await t.run(async (ctx) => {
        const reqs = await ctx.db
          .query("shiftRequests")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const sub = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first();
        return [reqs, sub] as const;
      });

      expect(requests).toHaveLength(1);
      expect(requests[0].date).toBe("2026-04-10");
      expect(submission?.submittedAt).toBeGreaterThanOrEqual(firstSubmission?.submittedAt ?? 0);
    });

    it("募集期間外の日付でエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          recruitmentId,
          requests: [{ date: "2026-04-14", startTime: "09:00", endTime: "18:00" }],
        }),
      ).rejects.toThrow("Date out of range");
    });

    it("startTime >= endTime でエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          recruitmentId,
          requests: [{ date: "2026-04-07", startTime: "18:00", endTime: "09:00" }],
        }),
      ).rejects.toThrow("Invalid time range");
    });
  });
});

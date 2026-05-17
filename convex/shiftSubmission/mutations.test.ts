import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

/** テスト用にshop + staff + recruitment + sessionをセットアップ */
async function setupTestData(t: TestConvex<typeof schema>, options?: { deadlinePassed?: boolean }) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "テスト店舗");
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    await ctx.db.insert("legalConsentStates", {
      subjectType: "staff",
      staffId,
      shopId,
      termsConsentVersion: "staff-terms-consent-2026-05-09",
      privacyConsentVersion: "staff-privacy-consent-2026-05-09",
      termsDocumentVersion: "staff-terms-doc-2026-05-09",
      privacyDocumentVersion: "staff-privacy-doc-2026-05-09",
      consentedAt: Date.now(),
      method: "staff_email_link",
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-04-07",
      periodEnd: "2026-04-13",
      deadline: options?.deadlinePassed ? "2026-01-01" : "2026-12-31",
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
    });
    const sessionToken = "test-session-token";
    await ctx.db.insert("sessions", {
      sessionToken,
      staffId,
      shopId,
      recruitmentId,
      accessKind: "submit",
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
          accessKind: "submit",
          expiresAt: Date.now() - 1000,
        });
        return token;
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken: expiredToken,
          accessKind: "submit",
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
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
        }),
      );

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
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
          accessKind: "submit",
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
        accessKind: "submit",
        recruitmentId,
        requests: validRequests,
      });

      const [slots, submission] = await t.run(async (ctx) => {
        const reqs = await ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const sub = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first();
        return [reqs, sub] as const;
      });

      expect(slots).toHaveLength(2);
      expect(slots[0].date).toBe("2026-04-07");
      expect(submission).not.toBeNull();
      expect(submission?.firstSubmittedAt).toBeTypeOf("number");
      expect(submission?.submittedAt).toBeTypeOf("number");
    });

    it("全休み提出（空配列）でshiftSubmissionのみ作成", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        requests: [],
      });

      const [slots, submission] = await t.run(async (ctx) => {
        const reqs = await ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const sub = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first();
        return [reqs, sub] as const;
      });

      expect(slots).toHaveLength(0);
      expect(submission).not.toBeNull();
    });

    it("文書バージョンだけ古い場合は再同意なしで提出できる", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);
      await t.run(async (ctx) => {
        const state = await ctx.db
          .query("legalConsentStates")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first();
        if (!state) throw new Error("missing state");
        await ctx.db.patch(state._id, {
          termsDocumentVersion: "staff-terms-doc-old",
          privacyDocumentVersion: "staff-privacy-doc-old",
        });
      });

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        requests: validRequests,
      });

      const submission = await t.run(async (ctx) =>
        ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first(),
      );
      expect(submission).not.toBeNull();
    });

    it("未同意スタッフは同意なしで提出できない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);
      await t.run(async (ctx) => {
        const states = await ctx.db
          .query("legalConsentStates")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect();
        for (const state of states) {
          await ctx.db.delete(state._id);
        }
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: validRequests,
        }),
      ).rejects.toThrow("Legal consent required");
    });

    it("未同意スタッフは提出時の同意で最新バージョンを記録できる", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);
      await t.run(async (ctx) => {
        const states = await ctx.db
          .query("legalConsentStates")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect();
        for (const state of states) {
          await ctx.db.delete(state._id);
        }
      });

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        requests: validRequests,
        acceptedLegal: true,
      });

      const [state, events] = await t.run(async (ctx) => {
        const state = await ctx.db
          .query("legalConsentStates")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first();
        const events = await ctx.db
          .query("legalConsentEvents")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect();
        return [state, events] as const;
      });

      expect(state?.termsConsentVersion).toBe("staff-terms-consent-2026-05-09");
      expect(state?.privacyConsentVersion).toBe("staff-privacy-consent-2026-05-09");
      expect(state?.termsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
      expect(state?.privacyDocumentVersion).toBe("staff-privacy-doc-2026-05-09");
      expect(state?.method).toBe("shift_submit");
      expect(events).toHaveLength(1);
      expect(events[0].method).toBe("shift_submit");
      expect(events[0].sourceRecruitmentId).toBe(recruitmentId);
    });

    it("既存提出がある場合はデータを置き換え＋submittedAt更新", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);
      const firstSubmission = await t.run(async (ctx) => {
        const submissionId = await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId,
          firstSubmittedAt: 500,
          submittedAt: 1000,
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId,
          staffId,
          date: "2026-04-07",
          startTime: "09:00",
          endTime: "18:00",
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId,
          staffId,
          date: "2026-04-09",
          startTime: "10:00",
          endTime: "15:00",
        });
        return await ctx.db.get(submissionId);
      });

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        requests: [{ date: "2026-04-10", startTime: "10:00", endTime: "20:00" }],
      });

      const [slots, submission] = await t.run(async (ctx) => {
        const reqs = await ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const sub = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first();
        return [reqs, sub] as const;
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].date).toBe("2026-04-10");
      expect(submission?.firstSubmittedAt).toBe(firstSubmission?.firstSubmittedAt);
      expect(submission?.submittedAt).toBeGreaterThanOrEqual(firstSubmission?.submittedAt ?? 0);
    });

    it("firstSubmittedAtがない既存提出の再提出では以前のsubmittedAtを初回提出時刻として保持する", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId,
          submittedAt: 1000,
        });
      });

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        requests: validRequests,
      });

      const submission = await t.run(async (ctx) =>
        ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .first(),
      );
      expect(submission?.firstSubmittedAt).toBe(1000);
      expect(submission?.submittedAt).toBeGreaterThan(1000);
    });

    it("募集期間外の日付でエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
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
          accessKind: "submit",
          recruitmentId,
          requests: [{ date: "2026-04-07", startTime: "18:00", endTime: "09:00" }],
        }),
      ).rejects.toThrow("Invalid time range");
    });

    it("同じ日の希望が複数ある場合はエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [
            { date: "2026-04-07", startTime: "09:00", endTime: "12:00" },
            { date: "2026-04-07", startTime: "13:00", endTime: "18:00" },
          ],
        }),
      ).rejects.toThrow("同じ日の希望シフトは1件だけ登録できます");
    });
  });
});

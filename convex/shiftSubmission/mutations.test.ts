import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_REQUESTS_PER_SUBMISSION_LIMIT } from "../constants";

/** テスト用にshop + staff + recruitment + sessionをセットアップ */
async function setupTestData(
  t: TestConvex<typeof schema>,
  options?: {
    deadlinePassed?: boolean;
    periodEnd?: string;
    shopClosedDates?: string[];
    submissionPattern?: ShiftSubmissionPattern;
  },
) {
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
      privacyConsentVersion: "staff-privacy-consent-2026-08-13",
      termsDocumentVersion: "staff-terms-doc-2026-05-09",
      privacyDocumentVersion: "staff-privacy-doc-2026-08-13",
      consentedAt: Date.now(),
      method: "staff_email_link",
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-04-07",
      periodEnd: options?.periodEnd ?? "2026-04-13",
      deadline: options?.deadlinePassed ? "2026-01-01" : "2026-12-31",
      shopClosedDates: options?.shopClosedDates ?? [],
      status: "open",
      isDeleted: false,
      submissionPattern: options?.submissionPattern ?? { kind: "time", startTime: "09:00", endTime: "22:00" },
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

async function migrateShopWithoutMigratingStaff(
  t: TestConvex<typeof schema>,
  args: {
    shopId: Id<"shops">;
    operatingStatus: "active" | "planSuspended";
    billingState: "active" | "restricted";
  },
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      name: "移行中テスト事業者",
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.shopId, { organizationId, operatingStatus: args.operatingStatus });
    await ctx.db.insert("organizationBillingStates", {
      organizationId,
      state:
        args.billingState === "active"
          ? { kind: "active", plan: "pro" }
          : {
              kind: "restricted",
              reason: "paymentGraceExpired",
              previousPlan: "pro",
              recoveryManagerPersonIds: [],
              previousActiveShopIds: [args.shopId],
              restrictedAt: now,
            },
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
}

const validRequests = [
  { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
];

describe("shiftSubmission/mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  describe("submitShiftRequests", () => {
    it("スタッフ所属店舗と異なる店舗を指すsessionでは提出できない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken } = await setupTestData(t);
      const otherRecruitmentId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "別店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: otherShopId,
          periodStart: "2026-04-07",
          periodEnd: "2026-04-13",
          deadline: "2026-12-31",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const session = await ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
          .first();
        if (!session) throw new Error("テスト用sessionが見つかりません");
        await ctx.db.patch(session._id, { shopId: otherShopId, recruitmentId });
        return recruitmentId;
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId: otherRecruitmentId,
          requests: [],
        }),
      ).rejects.toThrowError(ConvexError);

      expect(
        await t.run(async (ctx) =>
          ctx.db
            .query("shiftSubmissions")
            .withIndex("by_recruitmentId_staffId", (q) =>
              q.eq("recruitmentId", otherRecruitmentId).eq("staffId", staffId),
            )
            .first(),
        ),
      ).toBeNull();
    });

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

    it("同じsessionTokenが複数staffへ紐づく場合は任意のstaffとして認証しない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, sessionToken } = await setupTestData(t);
      await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "重複session別店舗");
        const otherStaffId = await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "別スタッフ",
          email: "duplicate-session@example.com",
          isDeleted: false,
        });
        const otherRecruitmentId = await ctx.db.insert("recruitments", {
          shopId: otherShopId,
          periodStart: "2026-04-07",
          periodEnd: "2026-04-13",
          deadline: "2026-12-31",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("sessions", {
          sessionToken,
          staffId: otherStaffId,
          shopId: otherShopId,
          recruitmentId: otherRecruitmentId,
          accessKind: "submit",
          expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
        });
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: validRequests,
        }),
      ).rejects.toThrow("Session expired");
      const submissions = await t.run((ctx) => ctx.db.query("shiftSubmissions").collect());
      expect(submissions).toEqual([]);
    });

    it("未リンクの移行中staffでもplanSuspended店舗では提出できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, sessionToken } = await setupTestData(t);
      await migrateShopWithoutMigratingStaff(t, {
        shopId,
        operatingStatus: "planSuspended",
        billingState: "active",
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: validRequests,
        }),
      ).rejects.toThrow("Not found");
      expect(await t.run((ctx) => ctx.db.query("shiftSubmissions").collect())).toEqual([]);
    });

    it("未リンクの移行中staffでもactive店舗が契約制限中なら提出できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, sessionToken } = await setupTestData(t);
      await migrateShopWithoutMigratingStaff(t, {
        shopId,
        operatingStatus: "active",
        billingState: "restricted",
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: validRequests,
        }),
      ).rejects.toThrow("契約状態を確認できるまで、閲覧と復旧に必要な操作のみ利用できます。");
      expect(await t.run((ctx) => ctx.db.query("shiftSubmissions").collect())).toEqual([]);
    });

    it("active.freeの実利用人数が上限を超えると未リンクの移行中staffも提出できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, sessionToken } = await setupTestData(t);
      await migrateShopWithoutMigratingStaff(t, {
        shopId,
        operatingStatus: "active",
        billingState: "active",
      });

      const baseline = await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        if (!shop?.organizationId) throw new Error("移行済み組織が見つかりません");
        const organizationId = shop.organizationId;
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("課金stateが見つかりません");
        await ctx.db.patch(billingState._id, {
          state: { kind: "active", plan: "free" },
          updatedAt: Date.now(),
        });

        for (let index = 0; index < 6; index += 1) {
          const email = `over-limit-staff-${index + 1}@example.com`;
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId,
            name: `上限超過スタッフ${index + 1}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          await ctx.db.insert("staffs", {
            organizationId,
            organizationPersonId: personId,
            shopId,
            name: `上限超過スタッフ${index + 1}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }

        const recruitmentStatsId = await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 0,
          activeStaffCountSnapshot: 7,
          updatedAt: Date.now(),
        });
        const persistedBillingState = await ctx.db.get(billingState._id);
        const recruitmentStats = await ctx.db.get(recruitmentStatsId);
        return { billingStateId: billingState._id, persistedBillingState, recruitmentStatsId, recruitmentStats };
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: validRequests,
        }),
      ).rejects.toMatchObject({ data: { code: "USAGE_LIMIT_EXCEEDED", plan: "free" } });

      const after = await t.run(async (ctx) => ({
        submissions: await ctx.db.query("shiftSubmissions").collect(),
        slots: await ctx.db.query("shiftSubmissionSlots").collect(),
        dates: await ctx.db.query("shiftSubmissionDates").collect(),
        recruitmentStats: await ctx.db.get(baseline.recruitmentStatsId),
        billingState: await ctx.db.get(baseline.billingStateId),
      }));
      expect(after).toEqual({
        submissions: [],
        slots: [],
        dates: [],
        recruitmentStats: baseline.recruitmentStats,
        billingState: baseline.persistedBillingState,
      });
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
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
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

    it("締切超過でも未提出なら初回提出でき、以降の変更はできない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, { deadlinePassed: true });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: validRequests,
        }),
      ).resolves.toBeNull();

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [],
        }),
      ).rejects.toThrow("Deadline passed");
    });

    it("シフト開始日以降は提出できない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { periodStart: "2026-03-01" });
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [],
        }),
      ).rejects.toThrow("Not found");
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

    it("希望枠は上限31件を受理し、32件目を拒否して既存提出を保持する", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t, { periodEnd: "2026-05-08" });
      const requests = Array.from({ length: SHIFT_REQUESTS_PER_SUBMISSION_LIMIT + 1 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 3, 7 + index));
        return { date: date.toISOString().slice(0, 10), startTime: "09:00", endTime: "18:00" };
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: requests.slice(0, SHIFT_REQUESTS_PER_SUBMISSION_LIMIT),
        }),
      ).resolves.toBeNull();

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests,
        }),
      ).rejects.toThrow("Invalid request data");

      const slots = await t.run(async (ctx) =>
        ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect(),
      );
      expect(slots).toHaveLength(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT);
    });

    it("不正な日付・時刻形式の希望提出は保存前に拒否する", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t);

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [{ date: "2026-02-31", startTime: "09:00", endTime: "18:00" }],
        }),
      ).rejects.toThrow("Invalid request data");
      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [{ date: "2026-04-07", startTime: "bad", endTime: "18:00" }],
        }),
      ).rejects.toThrow("Invalid request data");
      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [{ date: "2026-04-07", startTime: "09:00", endTime: "36:30" }],
        }),
      ).rejects.toThrow("Invalid request data");
    });

    it("定休日の日付には希望シフトを提出できない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, { shopClosedDates: ["2026-04-09"] });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          requests: [{ date: "2026-04-09", startTime: "10:00", endTime: "15:00" }],
        }),
      ).rejects.toThrow("定休日には希望シフトを提出できません");
    });

    it("日付のみ提出は日付だけ保存し、時間スロットを作らない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t, {
        submissionPattern: { kind: "dateOnly" },
      });

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        submission: { kind: "dateOnly", workingDates: ["2026-04-07", "2026-04-09"] },
      });

      const [slots, dates] = await t.run(async (ctx) => {
        const slotRows = await ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        const dateRows = await ctx.db
          .query("shiftSubmissionDates")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect();
        return [slotRows, dateRows] as const;
      });

      expect(slots).toHaveLength(0);
      expect(dates.map(({ date }) => date)).toEqual(["2026-04-07", "2026-04-09"]);
    });

    it("提出方法と違う入力種類はエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        submissionPattern: { kind: "dateOnly" },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: { kind: "time", requests: validRequests },
        }),
      ).rejects.toThrow("提出方法がこの募集の設定と一致しません");
    });

    it("日付のみ提出で同じ日を重複して提出できない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        submissionPattern: { kind: "dateOnly" },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: { kind: "dateOnly", workingDates: ["2026-04-07", "2026-04-07"] },
        }),
      ).rejects.toThrow("同じ日に登録できる希望シフトは1件だけです。");
    });

    it("日付のみ提出で不正な日付形式は拒否する", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        submissionPattern: { kind: "dateOnly" },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: { kind: "dateOnly", workingDates: ["2026-04-31"] },
        }),
      ).rejects.toThrow("Invalid request data");
    });

    it("日付のみ提出でも定休日は提出できない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        shopClosedDates: ["2026-04-09"],
        submissionPattern: { kind: "dateOnly" },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: { kind: "dateOnly", workingDates: ["2026-04-09"] },
        }),
      ).rejects.toThrow("定休日には希望シフトを提出できません");
    });

    it("勤務区分提出は選んだ区分の時間で希望枠を作成する", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId, staffId } = await setupTestData(t, {
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
          ],
        },
      });

      await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
        submission: {
          kind: "shiftType",
          selections: [
            { date: "2026-04-07", optionId: "morning" },
            { date: "2026-04-07", optionId: "late" },
            { date: "2026-04-09", optionId: "late" },
          ],
        },
      });

      const slots = await t.run(async (ctx) =>
        ctx.db
          .query("shiftSubmissionSlots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
          .collect(),
      );

      expect(slots.map(({ date, startTime, endTime, optionId }) => ({ date, startTime, endTime, optionId }))).toEqual([
        { date: "2026-04-07", startTime: "09:00", endTime: "15:00", optionId: "morning" },
        { date: "2026-04-07", startTime: "15:00", endTime: "22:00", optionId: "late" },
        { date: "2026-04-09", startTime: "15:00", endTime: "22:00", optionId: "late" },
      ]);
    });

    it("勤務区分提出で同じ日の同じ区分は重複して提出できない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 }],
        },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: {
            kind: "shiftType",
            selections: [
              { date: "2026-04-07", optionId: "morning" },
              { date: "2026-04-07", optionId: "morning" },
            ],
          },
        }),
      ).rejects.toThrow("同じ日の勤務区分が重複しています");
    });

    it("存在しない勤務区分IDはエラー", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 }],
        },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: { kind: "shiftType", selections: [{ date: "2026-04-07", optionId: "late" }] },
        }),
      ).rejects.toThrow("勤務区分が見つかりません");
    });

    it("勤務区分提出で不正な日付形式は拒否する", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupTestData(t, {
        submissionPattern: {
          kind: "shiftType",
          options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 }],
        },
      });

      await expect(
        t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
          submission: { kind: "shiftType", selections: [{ date: "2026-04-31", optionId: "morning" }] },
        }),
      ).rejects.toThrow("Invalid request data");
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
      expect(state?.privacyConsentVersion).toBe("staff-privacy-consent-2026-08-13");
      expect(state?.termsDocumentVersion).toBe("staff-terms-doc-2026-05-09");
      expect(state?.privacyDocumentVersion).toBe("staff-privacy-doc-2026-08-13");
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
      ).rejects.toThrow("同じ日に登録できる希望シフトは1件だけです。");
    });
  });
});

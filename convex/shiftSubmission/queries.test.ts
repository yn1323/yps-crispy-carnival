import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function setupSubmissionPageData(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "履歴テスト店舗");
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "履歴スタッフ",
      email: "history@example.com",
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
      periodStart: "2026-04-21",
      periodEnd: "2026-04-27",
      deadline: "2026-12-31",
      status: "open",
      isDeleted: false,
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
    });
    const sessionToken = "query-history-session";
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

async function seedSubmission(
  t: TestConvex<typeof schema>,
  args: {
    recruitmentId: Id<"recruitments">;
    staffId: Id<"staffs">;
    slots: Array<{ date: string; startTime: string; endTime: string }>;
  },
) {
  await t.run(async (ctx) => {
    const submissionId = await ctx.db.insert("shiftSubmissions", {
      recruitmentId: args.recruitmentId,
      staffId: args.staffId,
      firstSubmittedAt: 1000,
      submittedAt: 1000,
    });
    for (const slot of args.slots) {
      await ctx.db.insert("shiftSubmissionSlots", {
        submissionId,
        recruitmentId: args.recruitmentId,
        staffId: args.staffId,
        ...slot,
      });
    }
  });
}

async function seedRecruitment(
  t: TestConvex<typeof schema>,
  shopId: Id<"shops">,
  args: { periodStart: string; periodEnd: string },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("recruitments", {
      shopId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      deadline: "2026-12-31",
      status: "open",
      isDeleted: false,
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
    }),
  );
}

describe("shiftSubmission/queries", () => {
  describe("getSubmissionPageData", () => {
    it("直近のシフトあり週を previousWeeklyPattern として返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      const previousRecruitmentId = await seedRecruitment(t, shopId, {
        periodStart: "2026-04-06",
        periodEnd: "2026-04-12",
      });
      await seedSubmission(t, {
        recruitmentId: previousRecruitmentId,
        staffId,
        slots: [
          { date: "2026-04-07", startTime: "10:00", endTime: "18:00" },
          { date: "2026-04-09", startTime: "12:00", endTime: "20:00" },
        ],
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData?.previousWeeklyPattern).toEqual({
        sourceWeekStart: "2026-04-06",
        days: [
          { weekday: 2, startTime: "10:00", endTime: "18:00" },
          { weekday: 4, startTime: "12:00", endTime: "20:00" },
        ],
      });
    });

    it("直近週が全休みならさらに前のシフトあり週を返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      const allOffRecruitmentId = await seedRecruitment(t, shopId, {
        periodStart: "2026-04-13",
        periodEnd: "2026-04-19",
      });
      const previousRecruitmentId = await seedRecruitment(t, shopId, {
        periodStart: "2026-04-06",
        periodEnd: "2026-04-12",
      });
      await seedSubmission(t, { recruitmentId: allOffRecruitmentId, staffId, slots: [] });
      await seedSubmission(t, {
        recruitmentId: previousRecruitmentId,
        staffId,
        slots: [{ date: "2026-04-08", startTime: "08:00", endTime: "17:00" }],
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData?.previousWeeklyPattern).toEqual({
        sourceWeekStart: "2026-04-06",
        days: [{ weekday: 3, startTime: "09:00", endTime: "17:00" }],
      });
    });

    it("履歴なし、または全休み履歴のみなら previousWeeklyPattern は null", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      const allOffRecruitmentId = await seedRecruitment(t, shopId, {
        periodStart: "2026-04-13",
        periodEnd: "2026-04-19",
      });
      await seedSubmission(t, { recruitmentId: allOffRecruitmentId, staffId, slots: [] });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData?.previousWeeklyPattern).toBeNull();
    });

    it("締切後は有効な提出sessionがあっても提出画面データを返さない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await seedSubmission(t, {
        recruitmentId,
        staffId,
        slots: [{ date: "2026-04-21", startTime: "10:00", endTime: "18:00" }],
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { deadline: "2026-01-01" });
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData).toBeNull();
    });

    it("募集確定後は有効な提出sessionがあっても提出画面データを返さない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { status: "confirmed" });
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData).toBeNull();
    });
  });
});

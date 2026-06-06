import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function setupSubmissionPageData(
  t: TestConvex<typeof schema>,
  options?: { submissionPattern?: ShiftSubmissionPattern },
) {
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
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      submissionPattern: options?.submissionPattern,
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
    slots: Array<{ date: string; startTime: string; endTime: string; optionId?: string }>;
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

async function seedDateOnlySubmission(
  t: TestConvex<typeof schema>,
  args: {
    recruitmentId: Id<"recruitments">;
    staffId: Id<"staffs">;
    dates: string[];
  },
) {
  await t.run(async (ctx) => {
    const submissionId = await ctx.db.insert("shiftSubmissions", {
      recruitmentId: args.recruitmentId,
      staffId: args.staffId,
      firstSubmittedAt: 1000,
      submittedAt: 1000,
    });
    for (const date of args.dates) {
      await ctx.db.insert("shiftSubmissionDates", {
        submissionId,
        recruitmentId: args.recruitmentId,
        staffId: args.staffId,
        date,
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
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
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
          { date: "2026-04-07", startTime: "18:00", endTime: "21:00" },
          { date: "2026-04-09", startTime: "12:00", endTime: "20:00" },
        ],
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.previousWeeklyPattern).toEqual({
        sourceWeekStart: "2026-04-06",
        days: [
          { weekday: 2, startTime: "10:00", endTime: "18:00" },
          { weekday: 2, startTime: "18:00", endTime: "21:00" },
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

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.previousWeeklyPattern).toEqual({
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

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.previousWeeklyPattern).toBeNull();
    });

    it("提出済みスタッフは締切後でも確定前なら提出内容を閲覧できる", async () => {
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

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data).toMatchObject({
        isBeforeDeadline: false,
        hasSubmitted: true,
        existingRequests: [{ date: "2026-04-21", startTime: "10:00", endTime: "18:00" }],
        existingSelection: {
          kind: "time",
          requests: [{ date: "2026-04-21", startTime: "10:00", endTime: "18:00" }],
        },
        previousWeeklyPattern: null,
      });
    });

    it("日付のみ提出の既存希望を workingDates として返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t, {
        submissionPattern: { kind: "dateOnly" },
      });
      await seedDateOnlySubmission(t, { recruitmentId, staffId, dates: ["2026-04-21", "2026-04-23"] });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.submissionPattern).toEqual({ kind: "dateOnly" });
      expect(pageData.data.existingSelection).toEqual({
        kind: "dateOnly",
        workingDates: ["2026-04-21", "2026-04-23"],
        unmatchedRequests: [],
      });
    });

    it("日付のみ提出の前回入力は曜日だけのパターンとして返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t, {
        submissionPattern: { kind: "dateOnly" },
      });
      const previousRecruitmentId = await seedRecruitment(t, shopId, {
        periodStart: "2026-04-06",
        periodEnd: "2026-04-12",
      });
      await seedDateOnlySubmission(t, {
        recruitmentId: previousRecruitmentId,
        staffId,
        dates: ["2026-04-07", "2026-04-10"],
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.previousWeeklyPattern).toBeNull();
      expect(pageData.data.previousDateOnlyPattern).toEqual({
        sourceWeekStart: "2026-04-06",
        weekdays: [2, 5],
      });
    });

    it("勤務区分提出の既存希望を optionId として返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t, {
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
          ],
        },
      });
      await seedSubmission(t, {
        recruitmentId,
        staffId,
        slots: [
          { date: "2026-04-21", startTime: "09:00", endTime: "15:00" },
          { date: "2026-04-21", startTime: "15:00", endTime: "22:00" },
          { date: "2026-04-23", startTime: "15:00", endTime: "22:00" },
        ],
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.existingSelection).toEqual({
        kind: "shiftType",
        selections: [
          { date: "2026-04-21", optionId: "morning" },
          { date: "2026-04-21", optionId: "late" },
          { date: "2026-04-23", optionId: "late" },
        ],
        unmatchedRequests: [],
      });
    });

    it("勤務区分の時間帯が同じでも保存済みの optionId を優先して返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t, {
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "help", name: "ヘルプ", startTime: "09:00", endTime: "15:00", sortOrder: 1 },
          ],
        },
      });
      await seedSubmission(t, {
        recruitmentId,
        staffId,
        slots: [{ date: "2026-04-21", startTime: "09:00", endTime: "15:00", optionId: "morning" }],
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data.existingSelection).toEqual({
        kind: "shiftType",
        selections: [{ date: "2026-04-21", optionId: "morning" }],
        unmatchedRequests: [],
      });
    });

    it("未提出スタッフは締切後でも確定前なら締切後状態のデータを取得できる", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { deadline: "2026-01-01" });
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData.status).toBe("ok");
      if (pageData.status !== "ok") throw new Error("expected submission page data");
      expect(pageData.data).toMatchObject({
        isBeforeDeadline: false,
        hasSubmitted: false,
        existingRequests: [],
        previousWeeklyPattern: null,
      });
    });

    it("募集確定後は有効な提出sessionがあっても提出受付終了を返す", async () => {
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

      expect(pageData).toEqual({ status: "unavailable", reason: "submission_closed" });
    });

    it("募集削除後は有効な提出sessionがあっても募集削除済みを返す", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { isDeleted: true });
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData).toEqual({ status: "unavailable", reason: "recruitment_deleted" });
    });
  });
});

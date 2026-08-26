import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { seedStaff } from "../_test/scenarioBuilders";
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
      privacyConsentVersion: "staff-privacy-consent-2026-08-13",
      termsDocumentVersion: "staff-terms-doc-2026-08-26",
      privacyDocumentVersion: "staff-privacy-doc-2026-08-26",
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
      submissionPattern: options?.submissionPattern ?? { kind: "time", startTime: "09:00", endTime: "22:00" },
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

async function seedSubmissionUsageRestriction(
  t: TestConvex<typeof schema>,
  shopId: Id<"shops">,
  kind: "overLimit" | "unknown",
) {
  await t.run(async (ctx) => {
    const shop = await ctx.db.get(shopId);
    if (!shop?.organizationId) throw new Error("テスト用organizationが見つかりません");
    const now = Date.now();
    await ctx.db.insert("organizationBillingStates", {
      organizationId: shop.organizationId,
      state: { kind: "active", plan: "free" },
      freeShopId: shopId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    if (kind === "overLimit") {
      for (let index = 0; index < 6; index += 1) {
        await seedStaff(ctx, {
          shopId,
          name: `上限超過スタッフ${index + 1}`,
          email: `submission-over-limit-${index + 1}@example.com`,
        });
      }
      return;
    }
    for (let index = 0; index <= 100; index += 1) {
      const email = `submission-unknown-${index + 1}@example.com`;
      await ctx.db.insert("organizationPeople", {
        organizationId: shop.organizationId,
        name: `判定不能人物${index + 1}`,
        email,
        emailNormalized: email,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

describe("shiftSubmission/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  describe("getSubmissionPageData", () => {
    it("billing state未移行中は従来どおり提出画面データを返す", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupSubmissionPageData(t);

      const result = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(result.status).toBe("ok");
    });

    it.each([
      ["overLimit", "usage_limit_exceeded"],
      ["unknown", "usage_limit_evaluation_unavailable"],
    ] as const)("利用上限が%sなら受付終了と区別できる理由を返す", async (kind, reason) => {
      const t = convexTest(schema, modules);
      const { shopId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await seedSubmissionUsageRestriction(t, shopId, kind);

      const result = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(result).toEqual({ status: "unavailable", reason });
    });

    it("スタッフ所属店舗と異なる店舗を指すsessionは無効として扱う", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken } = await setupSubmissionPageData(t);
      const otherRecruitmentId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "別店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: otherShopId,
          periodStart: "2026-04-21",
          periodEnd: "2026-04-27",
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

      const result = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId: otherRecruitmentId,
      });

      expect(result).toEqual({ status: "unavailable", reason: "invalid_link" });
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

    it("未リンクの移行中staffでも削除済み事業者のsessionは無効として扱う", async () => {
      const t = convexTest(schema, modules);
      const { shopId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await t.run(async (ctx) => {
        const now = Date.now();
        const organizationId = await ctx.db.insert("organizations", {
          name: "削除済み移行テスト事業者",
          isDeleted: true,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      });

      const result = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(result).toEqual({ status: "unavailable", reason: "invalid_link" });
    });

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

    it("提出済みスタッフは提出期限後でも確定前なら提出内容を閲覧できる", async () => {
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

    it("未提出スタッフは提出期限後でも確定前なら提出期限後状態のデータを取得できる", async () => {
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

    it("シフト開始日以降は有効な提出sessionがあっても提出受付終了を返す", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { periodStart: "2026-03-01" });
      });

      const pageData = await t.query(api.shiftSubmission.queries.getSubmissionPageData, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(pageData).toEqual({ status: "unavailable", reason: "submission_closed" });
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

  describe("getSubmissionResult", () => {
    it("有効なsubmit sessionと本人の提出recordから最小DTOだけを返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await seedSubmission(t, { recruitmentId, staffId, slots: [] });

      const result = await t.query(api.shiftSubmission.queries.getSubmissionResult, {
        sessionToken,
        accessKind: "submit",
        recruitmentId,
      });

      expect(result).toEqual({ status: "submitted", shopName: "履歴テスト店舗" });
    });

    it("本人の提出recordがない場合は提出済みと返さない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken, recruitmentId } = await setupSubmissionPageData(t);

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });

    it("sessionが存在しない、期限切れ、失効済みの場合は提出済みと返さない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await seedSubmission(t, { recruitmentId, staffId, slots: [] });

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken: "missing-session",
          accessKind: "submit",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });

      await t.run(async (ctx) => {
        const session = await ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
          .unique();
        if (!session) throw new Error("テスト用sessionが見つかりません");
        await ctx.db.patch(session._id, { expiresAt: Date.now() - 1 });
      });
      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });

      await t.run(async (ctx) => {
        const session = await ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
          .unique();
        if (!session) throw new Error("テスト用sessionが見つかりません");
        await ctx.db.patch(session._id, { expiresAt: Date.now() + 60_000, revokedAt: Date.now() });
      });
      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });

    it("callerがviewを指定したview sessionでは提出recordを確認できない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await seedSubmission(t, { recruitmentId, staffId, slots: [] });
      await t.run(async (ctx) => {
        const session = await ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
          .unique();
        if (!session) throw new Error("テスト用sessionが見つかりません");
        await ctx.db.patch(session._id, { accessKind: "view" });
      });

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "view",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });

    it("sessionと募集が一致しない場合は他募集の提出を確認できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, sessionToken } = await setupSubmissionPageData(t);
      const otherRecruitmentId = await seedRecruitment(t, shopId, {
        periodStart: "2026-05-01",
        periodEnd: "2026-05-07",
      });

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId: otherRecruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });

    it("他スタッフの提出recordだけでは提出済みと返さない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      const otherStaffId = await t.run(async (ctx) =>
        ctx.db.insert("staffs", {
          shopId,
          name: "別スタッフ",
          email: "other@example.com",
          isDeleted: false,
        }),
      );
      await seedSubmission(t, { recruitmentId, staffId: otherStaffId, slots: [] });

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });

    it("sessionの店舗と異なる募集では提出済みと返さない", async () => {
      const t = convexTest(schema, modules);
      const { sessionToken } = await setupSubmissionPageData(t);
      const otherShopId = await t.run(async (ctx) => seedShop(ctx, "別店舗"));
      const otherRecruitmentId = await seedRecruitment(t, otherShopId, {
        periodStart: "2026-05-01",
        periodEnd: "2026-05-07",
      });
      await t.run(async (ctx) => {
        const session = await ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
          .unique();
        if (!session) throw new Error("テスト用sessionが見つかりません");
        await ctx.db.patch(session._id, { recruitmentId: otherRecruitmentId });
      });

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId: otherRecruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });

    it.each(["", "x".repeat(129), "not-a-convex-id"])(
      "不正な募集ID %j はDBエラーにせず利用不可を返す",
      async (input) => {
        const t = convexTest(schema, modules);
        const { sessionToken } = await setupSubmissionPageData(t);

        expect(
          await t.query(api.shiftSubmission.queries.getSubmissionResult, {
            sessionToken,
            accessKind: "submit",
            recruitmentId: input,
          }),
        ).toEqual({ status: "unavailable" });
      },
    );

    it("募集が削除された後は提出recordがあっても提出済みと返さない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, sessionToken, recruitmentId } = await setupSubmissionPageData(t);
      await seedSubmission(t, { recruitmentId, staffId, slots: [] });
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { isDeleted: true });
      });

      expect(
        await t.query(api.shiftSubmission.queries.getSubmissionResult, {
          sessionToken,
          accessKind: "submit",
          recruitmentId,
        }),
      ).toEqual({ status: "unavailable" });
    });
  });
});

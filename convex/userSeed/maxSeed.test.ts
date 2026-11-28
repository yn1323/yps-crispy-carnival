import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_SELF_CREATED_LIMIT,
  PERSON_NAME_MAX_LENGTH,
  POSITION_ACTIVE_LIMIT,
  POSITION_NAME_MAX_LENGTH,
  RECRUITMENT_PERIOD_DAYS_MAX,
  SHIFT_ASSIGNMENT_BREAK_LIMIT,
  SHIFT_ASSIGNMENT_LIMIT,
  SHIFT_BOARD_SHIFT_REQUEST_LIMIT,
  SHIFT_DATE_NOTE_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_REQUESTS_PER_SUBMISSION_LIMIT,
  SHOP_NAME_MAX_LENGTH,
  STAFF_REGISTRATION_PENDING_LIMIT,
} from "../constants";
import { getOrganizationUsageSnapshot } from "../organization/service";
import { ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/planLimits";
import { validateShiftAssignments } from "../shiftBoard/validation";
import { findDayTemplateIssue } from "../shiftSetup/dayTemplates";
import { USER_SEED_PRODUCTION_DEPLOYMENT_NAME } from "./guard";
import { USER_SEED_MAX_ORGANIZATION_NAME } from "./maxBuilders";

const RANDOM_SEED = 20261123;
const TRIAL_LIMITS = ORGANIZATION_PLAN_LIMITS.trial;

function enableUserSeed() {
  vi.stubEnv("DEBUG_MODE", "true");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://user-seed-development.convex.cloud");
}

async function countRows(t: TestConvex<typeof schema>, table: "organizations" | "recruitments") {
  return await t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

async function readScheduledFunctionNames(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name),
  );
}

async function setupFreshUser() {
  enableUserSeed();
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => seedUser(ctx, "seed_max_target", "manager@example.test"));
  return { t, userId };
}

describe("userSeed 上限の確認用データ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T10:00:00+09:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("有効にする条件", () => {
    it.each([
      { label: "DEBUG_MODEがない実行先", debugMode: "", host: "user-seed-development", message: "DEBUG_MODE" },
      {
        label: "本番のdeployment",
        debugMode: "true",
        host: USER_SEED_PRODUCTION_DEPLOYMENT_NAME,
        message: "production",
      },
    ])("$labelでは、通しの投入と各段のどれも拒否してDBを変えない", async ({ debugMode, host, message }) => {
      vi.stubEnv("DEBUG_MODE", debugMode);
      vi.stubEnv("CONVEX_CLOUD_URL", `https://${host}.convex.cloud`);
      const t = convexTest(schema, modules);
      const { userId, shopId } = await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "seed_max_disabled", plan: "free" }),
      );

      await expect(t.action(internal.userSeed.actions.seedMaxUserOrganizations, { userId })).rejects.toThrowError(
        message,
      );
      await expect(t.mutation(internal.userSeed.mutations.seedMaxOrganizations, { userId })).rejects.toThrowError(
        message,
      );
      await expect(
        t.mutation(internal.userSeed.mutations.seedMaxRecruitment, {
          userId,
          shopId,
          recruitmentKey: "recruiting",
          today: "2026-11-22",
          randomSeed: RANDOM_SEED,
        }),
      ).rejects.toThrowError(message);
      expect(await countRows(t, "organizations")).toBe(1);
      expect(await countRows(t, "recruitments")).toBe(0);
    });
  });

  describe("seedMaxUserOrganizations", () => {
    it("組織を上限の数だけ作り、1つ目の組織の店舗、人、管理者、名前、必要人数、募集を上限まで入れる", async () => {
      const { t, userId } = await setupFreshUser();

      const result = await t.action(internal.userSeed.actions.seedMaxUserOrganizations, {
        userId,
        randomSeed: RANDOM_SEED,
      });

      expect(result.randomSeed).toBe(RANDOM_SEED);
      expect(result.noteMismatchCount).toBe(0);
      expect(result.organizations.map((organization) => organization.name)).toEqual([
        USER_SEED_MAX_ORGANIZATION_NAME,
        "シフトリ確認用グループ（2つ目）",
        "シフトリ確認用グループ（3つ目）",
      ]);
      expect(result.organizations).toHaveLength(ORGANIZATION_SELF_CREATED_LIMIT);
      expect(USER_SEED_MAX_ORGANIZATION_NAME).toHaveLength(ORGANIZATION_NAME_MAX_LENGTH);
      expect(result.organizations.map((organization) => organization.shops.length)).toEqual([
        TRIAL_LIMITS.maxShops,
        1,
        1,
      ]);
      const [maxOrganization] = result.organizations;

      // 利用人数、管理者（招待中を含む）、店舗が、プランの上限ちょうどになる。
      const usage = await t.run(async (ctx) => getOrganizationUsageSnapshot(ctx, maxOrganization.organizationId));
      expect({
        people: usage.projectedPersonCount,
        managers: usage.projectedActiveManagerCount,
        activeManagers: usage.activeManagerCount,
        shops: usage.shopCount,
      }).toEqual({
        people: TRIAL_LIMITS.maxPeople,
        managers: TRIAL_LIMITS.maxActiveManagers,
        activeManagers: 1,
        shops: TRIAL_LIMITS.maxShops,
      });

      const snapshot = await t.run(async (ctx) => {
        const shops = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", maxOrganization.organizationId))
          .collect();
        const perShop = [];
        for (const shop of shops) {
          const staffs = await ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
            .collect();
          const positions = await ctx.db
            .query("positions")
            .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
            .collect();
          const templates = await ctx.db
            .query("shiftDayTemplates")
            .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
            .collect();
          const requests = await ctx.db
            .query("staffRegistrationRequests")
            .filter((q) => q.eq(q.field("shopId"), shop._id))
            .collect();
          const recruitments = await ctx.db
            .query("recruitments")
            .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
            .collect();
          const perRecruitment = [];
          for (const recruitment of recruitments) {
            const assignments = await ctx.db
              .query("shiftAssignments")
              .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitment._id))
              .collect();
            const slots = await ctx.db
              .query("shiftSubmissionSlots")
              .filter((q) => q.eq(q.field("recruitmentId"), recruitment._id))
              .collect();
            const dates = await ctx.db
              .query("shiftSubmissionDates")
              .filter((q) => q.eq(q.field("recruitmentId"), recruitment._id))
              .collect();
            const notes = await ctx.db
              .query("shiftSubmissionDateNotes")
              .filter((q) => q.eq(q.field("recruitmentId"), recruitment._id))
              .collect();
            const countByStaff = (rows: Array<{ staffId: Id<"staffs"> }>) => {
              const counts = new Map<string, number>();
              for (const row of rows) counts.set(row.staffId, (counts.get(row.staffId) ?? 0) + 1);
              return Math.max(0, ...counts.values());
            };
            perRecruitment.push({
              periodStart: recruitment.periodStart,
              status: recruitment.status,
              days: recruitment.shopClosedDates.length + new Set([...slots, ...dates].map((row) => row.date)).size,
              preferenceCount: slots.length + dates.length,
              assignmentCount: assignments.length,
              maxPreferencesPerStaff: countByStaff([...slots, ...dates]),
              maxNotesPerStaff: countByStaff(notes),
              noteLengths: [...new Set(notes.map((note) => note.note.length))],
              maxBreakCount: Math.max(0, ...assignments.map((assignment) => assignment.breaks?.length ?? 0)),
              assignmentIssues: validateShiftAssignments({
                assignments,
                periodStart: recruitment.periodStart,
                periodEnd: recruitment.periodEnd,
                closedDates: recruitment.shopClosedDates,
                pattern: shop.submissionPattern,
              }),
            });
          }
          perShop.push({
            nameLength: shop.name.length,
            pattern: shop.submissionPattern.kind,
            staffCount: staffs.length,
            excludedCount: staffs.filter((staff) => staff.excludedFromShift).length,
            staffNameLengths: [
              ...new Set(staffs.filter((staff) => staff.userId !== userId).map((staff) => staff.name.length)),
            ],
            positionCount: positions.length,
            positionNameLengths: [...new Set(positions.map((position) => position.name.length))],
            templateCount: templates.length,
            templateNameLengths: [...new Set(templates.map((template) => template.name.length))],
            templateIssue: findDayTemplateIssue({ templates, pattern: shop.submissionPattern }),
            maxBarCount: Math.max(
              0,
              ...templates.map((template) =>
                template.requirements.kind === "time" ? template.requirements.bars.length : 0,
              ),
            ),
            pendingRequestCount: requests.filter((request) => request.status === "pending").length,
            recruitments: perRecruitment.sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
          });
        }
        const invitations = await ctx.db
          .query("organizationInvitations")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", maxOrganization.organizationId))
          .collect();
        const staffEmails = (await ctx.db.query("staffs").collect())
          .filter((staff) => staff.userId !== userId)
          .map((staff) => staff.email);
        const requestEmails = (await ctx.db.query("staffRegistrationRequests").collect()).map(
          (request) => request.email,
        );
        return {
          perShop,
          invitations: invitations.map(({ status, reservedSeat, tokenDigest, email }) => ({
            status,
            reservedSeat,
            // 実際のtokenの照合値（sha256の16進64文字）と一致しない形で保存する。
            usesUnusableDigest: tokenDigest.startsWith("user-seed:"),
            email,
          })),
          emails: [...staffEmails, ...requestEmails, ...invitations.map((invitation) => invitation.email)],
        };
      });

      const fullDays = RECRUITMENT_PERIOD_DAYS_MAX;
      const expectedRecruitments = (maxBreakCount: number) =>
        [
          { periodStart: "2026-10-07", status: "confirmed", hasAssignments: true },
          { periodStart: "2026-11-07", status: "confirmed", hasAssignments: true },
          { periodStart: "2026-12-08", status: "open", hasAssignments: true },
          { periodStart: "2027-01-08", status: "open", hasAssignments: false },
        ].map(({ periodStart, status, hasAssignments }) => ({
          periodStart,
          status,
          days: fullDays,
          maxPreferencesPerStaff: SHIFT_REQUESTS_PER_SUBMISSION_LIMIT,
          maxNotesPerStaff: SHIFT_REQUESTS_PER_SUBMISSION_LIMIT,
          noteLengths: [SHIFT_DATE_NOTE_MAX_LENGTH],
          maxBreakCount: hasAssignments ? maxBreakCount : 0,
          assignmentIssues: [],
        }));
      const project = (shop: (typeof snapshot.perShop)[number]) => ({
        ...shop,
        recruitments: shop.recruitments.map(({ preferenceCount: _p, assignmentCount: _a, ...rest }) => rest),
      });
      const baseShop = {
        nameLength: SHOP_NAME_MAX_LENGTH,
        staffCount: TRIAL_LIMITS.maxPeople,
        staffNameLengths: [PERSON_NAME_MAX_LENGTH],
        positionCount: POSITION_ACTIVE_LIMIT,
        positionNameLengths: [POSITION_NAME_MAX_LENGTH],
        templateCount: SHIFT_DAY_TEMPLATE_LIMIT,
        templateNameLengths: [SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH],
        templateIssue: null,
        pendingRequestCount: 0,
      };
      // 定休日のある店舗は、1人あたりの希望とメモが営業する日の数までになる。
      const closedShopRecruitments = (shop: (typeof snapshot.perShop)[number], maxBreakCount: number) =>
        expectedRecruitments(maxBreakCount).map((recruitment, index) => ({
          ...recruitment,
          maxPreferencesPerStaff: shop.recruitments[index].maxPreferencesPerStaff,
          maxNotesPerStaff: shop.recruitments[index].maxNotesPerStaff,
        }));
      expect(snapshot.perShop.map(project)).toEqual([
        {
          ...baseShop,
          pattern: "time",
          excludedCount: 0,
          maxBarCount: SHIFT_DAY_TEMPLATE_BAR_LIMIT,
          recruitments: expectedRecruitments(SHIFT_ASSIGNMENT_BREAK_LIMIT),
        },
        {
          ...baseShop,
          pattern: "dateOnly",
          excludedCount: 0,
          maxBarCount: 0,
          pendingRequestCount: STAFF_REGISTRATION_PENDING_LIMIT,
          recruitments: expectedRecruitments(0),
        },
        {
          ...baseShop,
          pattern: "shiftType",
          excludedCount: 0,
          maxBarCount: 0,
          recruitments: expectedRecruitments(0),
        },
        {
          ...baseShop,
          pattern: "time",
          excludedCount: 1,
          maxBarCount: SHIFT_DAY_TEMPLATE_BAR_LIMIT,
          recruitments: closedShopRecruitments(snapshot.perShop[3], 17),
        },
        {
          ...baseShop,
          pattern: "shiftType",
          excludedCount: 1,
          maxBarCount: 0,
          recruitments: closedShopRecruitments(snapshot.perShop[4], 0),
        },
      ]);
      for (const shop of snapshot.perShop.slice(3)) {
        for (const recruitment of shop.recruitments) {
          expect(recruitment.maxPreferencesPerStaff).toBeLessThan(SHIFT_REQUESTS_PER_SUBMISSION_LIMIT);
          expect(recruitment.maxPreferencesPerStaff).toBeGreaterThan(0);
        }
      }
      // 希望と割り当ては、シフト表が読める件数に収まる。
      for (const recruitment of snapshot.perShop.flatMap((shop) => shop.recruitments)) {
        expect(recruitment.preferenceCount).toBeGreaterThan(0);
        expect(recruitment.preferenceCount).toBeLessThanOrEqual(SHIFT_BOARD_SHIFT_REQUEST_LIMIT);
        expect(recruitment.assignmentCount).toBeLessThanOrEqual(SHIFT_ASSIGNMENT_LIMIT);
      }

      expect(snapshot.invitations.map(({ email: _email, ...rest }) => rest)).toEqual(
        Array.from({ length: TRIAL_LIMITS.maxActiveManagers - 1 }, () => ({
          status: "issued",
          reservedSeat: false,
          usesUnusableDigest: true,
        })),
      );
      // 通知を予約せず、管理者本人以外のメールアドレスをすべてexample.comにする。
      expect(await readScheduledFunctionNames(t)).toEqual([]);
      expect(snapshot.emails.length).toBeGreaterThan(0);
      expect(snapshot.emails.filter((email) => !email.endsWith("@example.com"))).toEqual([]);
    });

    // 上限は同じ店舗の4つの募集で変わらないため、店舗ごとに、割り当てのある今日を含む募集で確かめる。
    it("上限まで入れた店舗はすべて、管理者のシフト表のqueryで割り当てと必要人数まで読める", async () => {
      const { t, userId } = await setupFreshUser();
      const result = await t.action(internal.userSeed.actions.seedMaxUserOrganizations, {
        userId,
        randomSeed: RANDOM_SEED,
      });
      const [maxOrganization] = result.organizations;
      const manager = t.withIdentity({ subject: "seed_max_target" });
      const recruitments = await t.run(async (ctx) => {
        const shops = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", maxOrganization.organizationId))
          .collect();
        const rows: Array<{ shopId: Id<"shops">; recruitmentId: Id<"recruitments"> }> = [];
        for (const shop of shops) {
          const shopRecruitments = await ctx.db
            .query("recruitments")
            .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
            .collect();
          rows.push(
            ...shopRecruitments
              .filter((recruitment) => recruitment.periodStart <= "2026-11-22" && recruitment.periodEnd >= "2026-11-22")
              .map((recruitment) => ({ shopId: shop._id, recruitmentId: recruitment._id })),
          );
        }
        return rows;
      });

      const readCounts: number[] = [];
      for (const { shopId, recruitmentId } of recruitments) {
        const scope = { shopId, expectedOrganizationId: maxOrganization.organizationId, recruitmentId };
        const board = await manager.query(api.shiftBoard.queries.getShiftBoardData, {
          ...scope,
          refreshDayKey: "2026-11-22",
        });
        const staffing = await manager.query(api.shiftBoard.queries.getShiftBoardStaffing, scope);
        expect(board).not.toBeNull();
        expect(staffing).not.toBeNull();
        readCounts.push(board?.shiftAssignments.length ?? -1);
      }
      expect(readCounts).toEqual(
        maxOrganization.shops.map(
          (shop) => shop.recruitments.find((recruitment) => recruitment.key === "confirmedChanged")?.assignmentCount,
        ),
      );
      expect(readCounts.every((count) => count > 0)).toBe(true);
    });

    it("消さずに残した組織があって上限の数まで作れないときは、組織を1つも作らない", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const { userId } = await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "seed_max_kept", plan: "standard" }),
      );

      await expect(
        t.action(internal.userSeed.actions.seedMaxUserOrganizations, { userId, randomSeed: RANDOM_SEED }),
      ).rejects.toThrowError("作成できる組織は3つまでです");
      expect(await countRows(t, "organizations")).toBe(1);
      expect(await countRows(t, "recruitments")).toBe(0);
    });
  });

  describe("seedMaxRecruitment", () => {
    it("上限いっぱいの組織の店舗にだけ書き、ほかの組織の店舗と、入れ済みの募集は拒否する", async () => {
      const { t, userId } = await setupFreshUser();
      const setup = await t.mutation(internal.userSeed.mutations.seedMaxOrganizations, {
        userId,
        randomSeed: RANDOM_SEED,
      });
      const other = await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "seed_max_other", plan: "free" }),
      );
      const [maxOrganization, lightOrganization] = setup.organizations;
      const recruitmentCountBefore = await countRows(t, "recruitments");
      const run = (shopId: Id<"shops">, targetUserId = userId) =>
        t.mutation(internal.userSeed.mutations.seedMaxRecruitment, {
          userId: targetUserId,
          shopId,
          recruitmentKey: "recruiting",
          today: setup.today,
          randomSeed: RANDOM_SEED,
        });

      // 他人の店舗、自分の別の組織の店舗、他人が指定した自分の店舗。
      await expect(run(other.shopId)).rejects.toThrowError("was not found");
      await expect(run(lightOrganization.shops[0].shopId)).rejects.toThrowError("was not found");
      await expect(run(maxOrganization.shops[0].shopId, other.userId)).rejects.toThrowError("was not found");
      expect(await countRows(t, "recruitments")).toBe(recruitmentCountBefore);

      const first = await run(maxOrganization.shops[0].shopId);
      expect(first.summary).toMatchObject({ key: "recruiting", status: "open", assignmentCount: 0 });
      await expect(run(maxOrganization.shops[0].shopId)).rejects.toThrowError("already exists");
      expect(await countRows(t, "recruitments")).toBe(recruitmentCountBefore + 1);
    });
  });
});

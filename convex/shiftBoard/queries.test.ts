import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_DATE_NOTE_LIMIT } from "../constants";

const QUERY_REFRESH_DAY_KEY = "2026-07-22";

async function getExpectedOrganizationId(t: TestConvex<typeof schema>, shopId: Id<"shops">) {
  return await t.run(async (ctx) => {
    const shop = await ctx.db.get(shopId);
    if (!shop) throw new Error("canonical shop fixture is missing");
    return shop.organizationId;
  });
}

describe("shiftBoard/queries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("app用queryはURL組織と募集の店舗組織を再検証し、別組織の募集を返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, {
        subject: "app_shift_board_actor",
        shopName: "対象店舗",
      });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "app_shift_board_other",
        shopName: "別組織店舗",
      });
      const createRecruitment = (shopId: typeof actor.shopId) =>
        ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-08-17",
          periodEnd: "2026-08-24",
          deadline: "2026-08-12",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
        });
      return {
        actor,
        other,
        actorRecruitmentId: await createRecruitment(actor.shopId),
        otherRecruitmentId: await createRecruitment(other.shopId),
      };
    });
    const actor = t.withIdentity({ subject: "app_shift_board_actor" });

    await expect(
      actor.query(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
        organizationId: ids.actor.organizationId,
        recruitmentId: ids.actorRecruitmentId,
      }),
    ).resolves.toEqual({ shopId: ids.actor.shopId, shopName: "対象店舗" });
    await expect(
      actor.query(api.shiftBoard.queries.getShiftBoardData, {
        shopId: ids.actor.shopId,
        expectedOrganizationId: ids.actor.organizationId,
        recruitmentId: ids.actorRecruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      }),
    ).resolves.toMatchObject({
      recruitment: { _id: ids.actorRecruitmentId },
    });
    await expect(
      actor.query(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
        organizationId: ids.actor.organizationId,
        recruitmentId: ids.otherRecruitmentId,
      }),
    ).resolves.toBeNull();
    await expect(
      actor.query(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
        organizationId: ids.other.organizationId,
        recruitmentId: ids.actorRecruitmentId,
      }),
    ).rejects.toThrow("Not found");
  });

  it("削除済み募集は null を返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_deleted_recruitment", shopName: "テスト店舗" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: true,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, recruitmentId };
    });

    const result = await t
      .withIdentity({ subject: "manager_deleted_recruitment" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result).toBeNull();
  });

  it("移行前の完全隣接割当は統合し、empty option付きセルはpresenceを保って分離する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "manager_adjacent_projection",
        shopName: "隣接表示店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "隣接表示スタッフ",
        email: "adjacent-projection@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-10",
        deadline: "2026-08-09",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      for (const [startTime, endTime] of [
        ["10:00", "12:00"],
        ["12:00", "18:00"],
      ] as const) {
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-08-10",
          startTime,
          endTime,
          positionId,
        });
      }
      return { shopId, staffId, positionId, recruitmentId };
    });

    const result = await t
      .withIdentity({ subject: "manager_adjacent_projection" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId: ids.shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
        recruitmentId: ids.recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.shiftAssignments).toEqual([
      {
        staffId: ids.staffId,
        date: "2026-08-10",
        startTime: "10:00",
        endTime: "18:00",
        positionId: ids.positionId,
      },
    ]);

    await t.run(async (ctx) => {
      const firstAssignment = await ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.recruitmentId))
        .filter((q) => q.eq(q.field("startTime"), "10:00"))
        .unique();
      if (!firstAssignment) throw new Error("empty option fixture assignment was not found");
      await ctx.db.patch(firstAssignment._id, { optionId: "" });
    });
    const resultWithEmptyOption = await t
      .withIdentity({ subject: "manager_adjacent_projection" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId: ids.shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
        recruitmentId: ids.recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });
    expect(resultWithEmptyOption?.shiftAssignments).toEqual([
      {
        staffId: ids.staffId,
        date: "2026-08-10",
        startTime: "10:00",
        endTime: "12:00",
        positionId: ids.positionId,
        optionId: "",
      },
      {
        staffId: ids.staffId,
        date: "2026-08-10",
        startTime: "12:00",
        endTime: "18:00",
        positionId: ids.positionId,
      },
    ]);
  });

  it("割当が上限を超える場合は部分的な表示DTOを返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "manager_assignment_overflow",
        shopName: "割当上限店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "割当上限スタッフ",
        email: "assignment-overflow@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-10",
        deadline: "2026-08-09",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      for (let index = 0; index <= SHIFT_ASSIGNMENT_LIMIT; index += 1) {
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-08-10",
          startTime: "10:00",
          endTime: "11:00",
          positionId,
        });
      }
      return { shopId, recruitmentId };
    });

    await expect(
      t.withIdentity({ subject: "manager_assignment_overflow" }).query(api.shiftBoard.queries.getShiftBoardData, {
        shopId: ids.shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
        recruitmentId: ids.recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      }),
    ).rejects.toThrow("Shift assignment scope exceeds the supported limit");
  });

  it("削除済み管理者にはシフトデータを返さない", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, shopId, recruitmentId } = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "removed_shift_board",
        shopName: "閲覧店舗",
        plan: "standard",
      });
      await ctx.db.patch(seeded.memberId, { status: "removed" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        deadline: "2026-07-28",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { organizationId: seeded.organizationId, shopId: seeded.shopId, recruitmentId };
    });

    const actor = t.withIdentity({ subject: "removed_shift_board" });
    await expect(
      actor.query(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
        organizationId,
        recruitmentId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: organizationId,
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      }),
    ).resolves.toBeNull();
  });

  it.each([
    { kind: "overLimit" as const, subject: "over_limit_shift_board" },
    { kind: "unknown" as const, subject: "unknown_usage_shift_board" },
  ])("利用上限が$kindならシフトデータを返しつつ通常操作を有効表示しない", async ({ kind, subject }) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject,
        shopName: "利用上限シフト店舗",
        plan: "free",
      });
      if (kind === "overLimit") {
        for (let index = 0; index < 5; index += 1) {
          await seedStaff(ctx, {
            shopId: seeded.shopId,
            name: `上限超過スタッフ${index + 1}`,
            email: `shift-board-over-limit-${index + 1}@example.com`,
          });
        }
      } else {
        const now = Date.now();
        for (let index = 0; index < 100; index += 1) {
          const email = `shift-board-unknown-${index + 1}@example.com`;
          await ctx.db.insert("organizationPeople", {
            organizationId: seeded.organizationId,
            name: `判定不能人物${index + 1}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        deadline: "2026-07-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { ...seeded, recruitmentId };
    });

    const result = await t.withIdentity({ subject }).query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
      recruitmentId: ids.recruitmentId,
      refreshDayKey: QUERY_REFRESH_DAY_KEY,
    });

    expect(result).toMatchObject({
      canWriteBusinessData: false,
      businessWriteBlockReason: kind === "unknown" ? "usageLimitEvaluationUnavailable" : "usageLimitExceeded",
      recruitment: { _id: ids.recruitmentId },
    });
  });

  it("billing stateがない場合はシフト操作をfail closedにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "missing_billing_shift_board",
        shopName: "billing移行中店舗",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("テスト用billing stateが見つかりません");
      await ctx.db.delete(billingState._id);
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        deadline: "2026-07-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { ...seeded, recruitmentId };
    });

    const result = await t
      .withIdentity({ subject: "missing_billing_shift_board" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId: ids.shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
        recruitmentId: ids.recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result).toMatchObject({
      canWriteBusinessData: false,
      businessWriteBlockReason: "usageLimitEvaluationUnavailable",
      recruitment: { _id: ids.recruitmentId },
    });
  });

  it("シフト対象外スタッフはシフト表に含めない", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, includedStaffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_excluded", shopName: "テスト店舗" });
      const includedStaffId = await seedStaff(ctx, {
        shopId,
        name: "通常スタッフ",
        email: "normal@example.com",
      });
      await seedStaff(ctx, {
        shopId,
        name: "対象外スタッフ",
        email: "excluded@example.com",
        excludedFromShift: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, recruitmentId, includedStaffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_excluded" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.staffs.map((s) => s._id)).toEqual([includedStaffId]);
  });

  it("有効な管理者のスタッフだけをisManagerで返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, managerStaffId, staffId } = await t.run(async (ctx) => {
      const { shopId, userId } = await seedManagerShop(ctx, { subject: "manager_flag", shopName: "テスト店舗" });
      const managerStaffId = await seedStaff(ctx, { shopId, name: "管理者", userId });
      const staffId = await seedStaff(ctx, { shopId, name: "通常スタッフ", email: "normal@example.com" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, recruitmentId, managerStaffId, staffId };
    });

    const result = await t.withIdentity({ subject: "manager_flag" }).query(api.shiftBoard.queries.getShiftBoardData, {
      shopId,
      expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
      recruitmentId,
      refreshDayKey: QUERY_REFRESH_DAY_KEY,
    });

    expect(result?.staffs.map((staff) => [staff._id, staff.isManager])).toEqual([
      [managerStaffId, true],
      [staffId, false],
    ]);
  });

  it("JST日付を跨いで過去募集になると削除済み割当スタッフをtombstoneで返す", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-20T14:59:59.000Z"));
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_removed_history", shopName: "履歴店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "削除済みスタッフ",
        email: "removed-history@example.com",
        isDeleted: true,
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "通常",
        color: "#000000",
        sortOrder: 0,
        isDefault: false,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-07-20",
        periodEnd: "2026-07-20",
        deadline: "2026-07-20",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2026-07-20",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { shopId, staffId, recruitmentId };
    });
    const actor = t.withIdentity({ subject: "manager_removed_history" });

    const current = await actor.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
      recruitmentId: ids.recruitmentId,
      refreshDayKey: "2026-07-20:current",
    });
    vi.setSystemTime(Date.parse("2026-07-20T15:00:00.000Z"));
    const past = await actor.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      expectedOrganizationId: await getExpectedOrganizationId(t, ids.shopId),
      recruitmentId: ids.recruitmentId,
      // 実subscriptionと同様、server側の日付変更後は別keyで再購読する。
      refreshDayKey: "2026-07-21:safe",
    });

    expect(past?.staffs).toContainEqual({
      _id: ids.staffId,
      name: "削除済みスタッフ",
      isRemoved: true,
      isSubmitted: true,
      createdAt: expect.any(Number),
      wasSubmittedAtDraft: false,
      isManager: false,
    });
    expect(current?.staffs.map((staff) => staff._id)).not.toContain(ids.staffId);
    expect(past?.shiftAssignments).toHaveLength(1);
    expect(current?.shiftAssignments).toHaveLength(1);
  });

  it("全休み提出は提出済みとして返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_all_off", shopName: "テスト店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "全休みスタッフ",
        email: "all-off@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
      return { shopId, recruitmentId, staffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_all_off" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.staffs).toEqual([
      {
        _id: staffId,
        name: "全休みスタッフ",
        isRemoved: false,
        isSubmitted: true,
        createdAt: expect.any(Number),
        wasSubmittedAtDraft: false,
        isManager: false,
      },
    ]);
  });

  it("日付選択提出の希望日をシフト表用データとして返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_date_only_board", shopName: "テスト店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "日付選択スタッフ",
        email: "date-only@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "dateOnly" },
      });
      const submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
      await ctx.db.insert("shiftSubmissionDates", {
        submissionId,
        recruitmentId,
        staffId,
        date: "2026-04-03",
      });
      return { shopId, recruitmentId, staffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_date_only_board" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.requestedDates).toEqual([{ staffId, date: "2026-04-03" }]);
    expect(result?.requestedSlots).toEqual([]);
  });

  it("パターン選択の募集のsnapshotとoptionIdつき希望・割当を返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId, positionId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_shift_type_board", shopName: "テスト店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "勤務パターンスタッフ",
        email: "shift-type@example.com",
      });
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#0d9488",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
          ],
        },
      });
      const submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: Date.now(),
        submittedAt: Date.now(),
      });
      await ctx.db.insert("shiftSubmissionSlots", {
        submissionId,
        recruitmentId,
        staffId,
        date: "2026-04-03",
        startTime: "09:00",
        endTime: "13:00",
        optionId: "morning",
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2026-04-03",
        startTime: "17:00",
        endTime: "21:00",
        positionId,
        optionId: "late",
      });
      return { shopId, recruitmentId, staffId, positionId };
    });

    const result = await t
      .withIdentity({ subject: "manager_shift_type_board" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.submissionPattern).toEqual({
      kind: "shiftType",
      options: [
        { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
        { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
      ],
    });
    expect(result?.requestedSlots).toEqual([
      { staffId, date: "2026-04-03", startTime: "09:00", endTime: "13:00", optionId: "morning" },
    ]);
    expect(result?.shiftAssignments).toEqual([
      { staffId, date: "2026-04-03", startTime: "17:00", endTime: "21:00", positionId, optionId: "late" },
    ]);
  });

  it("再提出待ちでも下書き保存時点の提出履歴を維持する", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffBeforeDraftId, staffAfterDraftId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_draft_status", shopName: "テスト店舗" });
      const staffBeforeDraftId = await seedStaff(ctx, {
        shopId,
        name: "保存前提出",
        email: "before@example.com",
      });
      const staffAfterDraftId = await seedStaff(ctx, {
        shopId,
        name: "保存後提出",
        email: "after@example.com",
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        draftSavedAt: 2000,
        editVersion: 1,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: staffBeforeDraftId,
        firstSubmittedAt: 1000,
        submittedAt: 3000,
        needsResubmission: true,
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: staffAfterDraftId,
        firstSubmittedAt: 3000,
        submittedAt: 3000,
      });
      return { shopId, recruitmentId, staffBeforeDraftId, staffAfterDraftId };
    });

    const result = await t
      .withIdentity({ subject: "manager_draft_status" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    const staffById = new Map(result?.staffs.map((s) => [s._id, s]));
    expect(staffById.get(staffBeforeDraftId)?.isSubmitted).toBe(false);
    expect(staffById.get(staffBeforeDraftId)?.wasSubmittedAtDraft).toBe(true);
    expect(staffById.get(staffAfterDraftId)?.isSubmitted).toBe(true);
    expect(staffById.get(staffAfterDraftId)?.wasSubmittedAtDraft).toBe(false);
    expect(result?.recruitment.draftSavedAt).toBe(2000);
    expect(result?.recruitment.editVersion).toBe(1);
  });

  it("分つきシフト時間は表示用に丸めつつ編集可能境界を分で返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_half_hour", shopName: "テスト店舗" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
      });
      return { shopId, recruitmentId };
    });

    const result = await t
      .withIdentity({ subject: "manager_half_hour" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.timeRange).toEqual({
      start: 5,
      end: 23,
      unit: 30,
      editableStartMinutes: 330,
      editableEndMinutes: 1350,
    });
  });

  it("募集スナップショットの時間指定を店舗設定より優先する", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_snapshot", shopName: "テスト店舗" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-07",
        deadline: "2026-03-28",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
      });
      return { shopId, recruitmentId };
    });

    const result = await t
      .withIdentity({ subject: "manager_snapshot" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        expectedOrganizationId: await getExpectedOrganizationId(t, shopId),
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.timeRange.editableStartMinutes).toBe(330);
    expect(result?.timeRange.editableEndMinutes).toBe(1350);
  });

  describe("getShiftBoardDateNotes", () => {
    async function seedDateNoteBoard(t: TestConvex<typeof schema>) {
      return await t.run(async (ctx) => {
        const actor = await seedManagerShop(ctx, { subject: "manager_date_notes", shopName: "メモ店舗" });
        await seedOrganizationManagerShop(ctx, { subject: "manager_date_notes_other", shopName: "別組織店舗" });
        const includedStaffId = await seedStaff(ctx, {
          shopId: actor.shopId,
          name: "通常スタッフ",
          email: "note-normal@example.com",
        });
        const excludedStaffId = await seedStaff(ctx, {
          shopId: actor.shopId,
          name: "対象外スタッフ",
          email: "note-excluded@example.com",
          excludedFromShift: true,
        });
        const deletedStaffId = await seedStaff(ctx, {
          shopId: actor.shopId,
          name: "削除済みスタッフ",
          email: "note-deleted@example.com",
        });
        await ctx.db.patch(deletedStaffId, { isDeleted: true });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: actor.shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const insertNote = async (staffId: Id<"staffs">, date: string, note: string) => {
          const submissionId = await ctx.db.insert("shiftSubmissions", {
            recruitmentId,
            staffId,
            firstSubmittedAt: 1000,
            submittedAt: 1000,
          });
          await ctx.db.insert("shiftSubmissionDateNotes", { submissionId, recruitmentId, staffId, date, note });
        };
        await insertNote(includedStaffId, "2026-04-02", "17時以降なら入れます");
        await insertNote(includedStaffId, "2026-04-10", "期間外に残ったメモ");
        await insertNote(excludedStaffId, "2026-04-02", "対象外スタッフのメモ");
        await insertNote(deletedStaffId, "2026-04-03", "削除済みスタッフのメモ");
        return { shopId: actor.shopId, organizationId: actor.organizationId, recruitmentId, includedStaffId };
      });
    }

    it("同じ店舗の管理者に、シフト表の有効スタッフの募集期間内のメモだけを最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedDateNoteBoard(t);

      const result = await t
        .withIdentity({ subject: "manager_date_notes" })
        .query(api.shiftBoard.queries.getShiftBoardDateNotes, {
          shopId: ids.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.recruitmentId,
        });

      expect(result).toEqual([{ staffId: ids.includedStaffId, date: "2026-04-02", note: "17時以降なら入れます" }]);
    });

    it("別組織の管理者にはメモを返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedDateNoteBoard(t);

      await expect(
        t.withIdentity({ subject: "manager_date_notes_other" }).query(api.shiftBoard.queries.getShiftBoardDateNotes, {
          shopId: ids.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
    });

    it("削除済み募集は null を返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedDateNoteBoard(t);
      await t.run(async (ctx) => await ctx.db.patch(ids.recruitmentId, { isDeleted: true }));

      await expect(
        t.withIdentity({ subject: "manager_date_notes" }).query(api.shiftBoard.queries.getShiftBoardDateNotes, {
          shopId: ids.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
    });

    it("メモが上限を超える場合は一部だけを返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedDateNoteBoard(t);
      await t.run(async (ctx) => {
        const submissionId = await ctx.db.insert("shiftSubmissions", {
          recruitmentId: ids.recruitmentId,
          staffId: ids.includedStaffId,
          firstSubmittedAt: 1000,
          submittedAt: 1000,
        });
        for (let index = 0; index < SHIFT_BOARD_DATE_NOTE_LIMIT; index += 1) {
          await ctx.db.insert("shiftSubmissionDateNotes", {
            submissionId,
            recruitmentId: ids.recruitmentId,
            staffId: ids.includedStaffId,
            date: "2026-04-01",
            note: "上限確認",
          });
        }
      });

      await expect(
        t.withIdentity({ subject: "manager_date_notes" }).query(api.shiftBoard.queries.getShiftBoardDateNotes, {
          shopId: ids.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.recruitmentId,
        }),
      ).rejects.toThrow("Shift date note scope exceeds the supported limit");
    });
  });

  // 2026-08-03、08-10、08-17は月曜日。前回の募集を08-03〜08-16、今回の募集を08-17〜08-23に置く。
  const STAFFING_MANAGER = "manager_shift_staffing";
  const STAFFING_OTHER_MANAGER = "manager_shift_staffing_other";
  const TIME_PATTERN = { kind: "time" as const, startTime: "09:00", endTime: "22:00" };
  const SHIFT_TYPE_BOARD_PATTERN = {
    kind: "shiftType" as const,
    options: [
      { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
      { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
    ],
  };
  type BoardPattern =
    | { kind: "time"; startTime: string; endTime: string }
    | { kind: "dateOnly" }
    | {
        kind: "shiftType";
        options: Array<{ id: string; name: string; startTime: string; endTime: string; sortOrder: number }>;
      };

  async function seedStaffingBoard(
    t: TestConvex<typeof schema>,
    options?: { submissionPattern?: BoardPattern; shopClosedDates?: string[]; status?: "open" | "confirmed" },
  ) {
    return await t.run(async (ctx) => {
      const actor = await seedManagerShop(ctx, { subject: STAFFING_MANAGER, shopName: "人数の多い店舗" });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: STAFFING_OTHER_MANAGER,
        shopName: "別組織店舗",
      });
      const insertPosition = (
        shopId: Id<"shops">,
        position: { name: string; color: string; sortOrder: number; isDefault?: boolean; isDeleted?: boolean },
      ) =>
        ctx.db.insert("positions", {
          shopId,
          name: position.name,
          color: position.color,
          sortOrder: position.sortOrder,
          isDefault: position.isDefault ?? false,
          isDeleted: position.isDeleted ?? false,
        });
      // 並び順は登録順ではなく、店舗が決めたsortOrderで決まる。既定のポジションも先頭に固定しない。
      const kitchenPositionId = await insertPosition(actor.shopId, {
        name: "キッチン",
        color: "#c2410c",
        sortOrder: 2,
      });
      const deletedPositionId = await insertPosition(actor.shopId, {
        name: "削除済みポジション",
        color: "#dc2626",
        sortOrder: 0,
        isDeleted: true,
      });
      const hallPositionId = await insertPosition(actor.shopId, { name: "ホール", color: "#7c3aed", sortOrder: 1 });
      const defaultPositionId = await insertPosition(actor.shopId, {
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 3,
        isDefault: true,
      });
      const otherPositionId = await insertPosition(other.shopId, {
        name: "別組織のポジション",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
      });

      const submissionPattern = options?.submissionPattern ?? TIME_PATTERN;
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: actor.shopId,
        periodStart: "2026-08-17",
        periodEnd: "2026-08-23",
        deadline: "2026-08-12",
        shopClosedDates: options?.shopClosedDates ?? [],
        status: options?.status ?? "open",
        ...(options?.status === "confirmed" ? { confirmedAt: 1_000 } : {}),
        isDeleted: false,
        submissionPattern,
      });
      const otherRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: other.shopId,
        periodStart: "2026-08-17",
        periodEnd: "2026-08-23",
        deadline: "2026-08-12",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: TIME_PATTERN,
      });

      const unsubmittedStaffId = await seedStaff(ctx, {
        shopId: actor.shopId,
        name: "未提出スタッフ",
        email: "unsubmitted@example.com",
      });
      const submittedStaffId = await seedStaff(ctx, {
        shopId: actor.shopId,
        name: "提出済みスタッフ",
        email: "submitted@example.com",
      });
      const resubmissionStaffId = await seedStaff(ctx, {
        shopId: actor.shopId,
        name: "再提出待ちスタッフ",
        email: "resubmission@example.com",
      });
      const excludedStaffId = await seedStaff(ctx, {
        shopId: actor.shopId,
        name: "シフト対象外スタッフ",
        email: "staffing-excluded@example.com",
        excludedFromShift: true,
      });
      const deletedStaffId = await seedStaff(ctx, {
        shopId: actor.shopId,
        name: "削除済みスタッフ",
        email: "staffing-deleted@example.com",
        isDeleted: true,
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: submittedStaffId,
        firstSubmittedAt: 1_000,
        submittedAt: 1_000,
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: resubmissionStaffId,
        firstSubmittedAt: 1_000,
        submittedAt: 1_000,
        needsResubmission: true,
      });

      return {
        shopId: actor.shopId,
        organizationId: actor.organizationId,
        scope: { shopId: actor.shopId, expectedOrganizationId: actor.organizationId },
        otherShopId: other.shopId,
        otherOrganizationId: other.organizationId,
        otherPositionId,
        otherRecruitmentId,
        defaultPositionId,
        hallPositionId,
        kitchenPositionId,
        deletedPositionId,
        recruitmentId,
        unsubmittedStaffId,
        submittedStaffId,
        resubmissionStaffId,
        excludedStaffId,
        deletedStaffId,
      };
    });
  }

  type StaffingBoardIds = Awaited<ReturnType<typeof seedStaffingBoard>>;

  async function seedRecruitment(
    t: TestConvex<typeof schema>,
    args: {
      shopId: Id<"shops">;
      periodStart: string;
      periodEnd: string;
      status?: "open" | "confirmed";
      isDeleted?: boolean;
      submissionPattern?: BoardPattern;
    },
  ) {
    return await t.run(async (ctx) =>
      ctx.db.insert("recruitments", {
        shopId: args.shopId,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        deadline: "2026-07-01",
        shopClosedDates: [],
        status: args.status ?? "confirmed",
        ...((args.status ?? "confirmed") === "confirmed" ? { confirmedAt: 1_000 } : {}),
        isDeleted: args.isDeleted ?? false,
        submissionPattern: args.submissionPattern ?? TIME_PATTERN,
      }),
    );
  }

  type SeedAssignment = {
    staffId: Id<"staffs">;
    date: string;
    startTime: string;
    endTime: string;
    positionId: Id<"positions">;
    optionId?: string;
    breaks?: Array<{ startTime: string; endTime: string }>;
    isProvisional?: boolean;
  };

  async function seedAssignments(
    t: TestConvex<typeof schema>,
    recruitmentId: Id<"recruitments">,
    assignments: SeedAssignment[],
  ) {
    await t.run(async (ctx) => {
      for (const assignment of assignments) {
        await ctx.db.insert("shiftAssignments", { recruitmentId, ...assignment });
      }
    });
  }

  const byDateAndStaff = <T extends { date: string; staffId: string; startTime: string }>(assignments: T[]) =>
    assignments
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.staffId.localeCompare(b.staffId) || a.startTime.localeCompare(b.startTime),
      );

  describe("getShiftBoardData（ポジション、休憩、仮の勤務）", () => {
    it("割当の休憩と仮の印を返し、提出済みスタッフの仮の勤務は返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      await seedAssignments(t, ids.recruitmentId, [
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-17",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
          breaks: [
            { startTime: "12:00", endTime: "13:00" },
            { startTime: "15:00", endTime: "15:15" },
          ],
          isProvisional: true,
        },
        {
          staffId: ids.submittedStaffId,
          date: "2026-08-17",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
          isProvisional: true,
        },
        {
          staffId: ids.submittedStaffId,
          date: "2026-08-18",
          startTime: "09:00",
          endTime: "15:00",
          positionId: ids.kitchenPositionId,
          breaks: [{ startTime: "12:00", endTime: "12:30" }],
        },
        // 再提出待ちは提出済みとして扱わないため、仮の勤務を残す。
        {
          staffId: ids.resubmissionStaffId,
          date: "2026-08-19",
          startTime: "17:00",
          endTime: "22:00",
          positionId: ids.defaultPositionId,
          isProvisional: true,
        },
      ]);

      const result = await t
        .withIdentity({ subject: STAFFING_MANAGER })
        .query(api.shiftBoard.queries.getShiftBoardData, {
          ...ids.scope,
          recruitmentId: ids.recruitmentId,
          refreshDayKey: QUERY_REFRESH_DAY_KEY,
        });

      expect(result).not.toBeNull();
      expect(byDateAndStaff(result?.shiftAssignments ?? [])).toStrictEqual(
        byDateAndStaff([
          {
            staffId: ids.unsubmittedStaffId,
            date: "2026-08-17",
            startTime: "10:00",
            endTime: "18:00",
            positionId: ids.hallPositionId,
            breaks: [
              { startTime: "12:00", endTime: "13:00" },
              { startTime: "15:00", endTime: "15:15" },
            ],
            isProvisional: true,
          },
          {
            staffId: ids.submittedStaffId,
            date: "2026-08-18",
            startTime: "09:00",
            endTime: "15:00",
            positionId: ids.kitchenPositionId,
            breaks: [{ startTime: "12:00", endTime: "12:30" }],
          },
          {
            staffId: ids.resubmissionStaffId,
            date: "2026-08-19",
            startTime: "17:00",
            endTime: "22:00",
            positionId: ids.defaultPositionId,
            isProvisional: true,
          },
        ]),
      );
    });

    it("時間指定で隣接する割当を統合して返すときも、休憩を落とさない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      await seedAssignments(t, ids.recruitmentId, [
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-17",
          startTime: "14:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
          breaks: [{ startTime: "16:00", endTime: "16:15" }],
        },
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-17",
          startTime: "10:00",
          endTime: "14:00",
          positionId: ids.hallPositionId,
          breaks: [{ startTime: "12:00", endTime: "13:00" }],
        },
      ]);

      const result = await t
        .withIdentity({ subject: STAFFING_MANAGER })
        .query(api.shiftBoard.queries.getShiftBoardData, {
          ...ids.scope,
          recruitmentId: ids.recruitmentId,
          refreshDayKey: QUERY_REFRESH_DAY_KEY,
        });

      expect(result?.shiftAssignments).toStrictEqual([
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-17",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
          breaks: [
            { startTime: "12:00", endTime: "13:00" },
            { startTime: "16:00", endTime: "16:15" },
          ],
        },
      ]);
    });

    it("有効なポジションだけを、店舗が決めた並び順で返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);

      const result = await t
        .withIdentity({ subject: STAFFING_MANAGER })
        .query(api.shiftBoard.queries.getShiftBoardData, {
          ...ids.scope,
          recruitmentId: ids.recruitmentId,
          refreshDayKey: QUERY_REFRESH_DAY_KEY,
        });

      expect(result?.positions).toEqual([
        { _id: ids.hallPositionId, name: "ホール", color: "#7c3aed", isDefault: false },
        { _id: ids.kitchenPositionId, name: "キッチン", color: "#c2410c", isDefault: false },
        { _id: ids.defaultPositionId, name: "シフト", color: "#3b82f6", isDefault: true },
      ]);
    });
  });

  describe("getShiftBoardStaffing", () => {
    const bar = (positionId: Id<"positions">, startTime: string, endTime: string) => ({
      positionId,
      startTime,
      endTime,
    });
    const getStaffing = (t: TestConvex<typeof schema>, ids: StaffingBoardIds) =>
      t
        .withIdentity({ subject: STAFFING_MANAGER })
        .query(api.shiftBoard.queries.getShiftBoardStaffing, { ...ids.scope, recruitmentId: ids.recruitmentId });
    const PERIOD_DATES = [
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ];
    const unsetDay = (date: string, source: "none" | "confirmed") => ({
      date,
      source,
      templateId: null,
      templateName: null,
      requirements: null,
    });

    /**
     * 募集期間（08-17 月 〜 08-23 日）の各日に、理由の違う必要人数が当たる設定を用意する。
     * 祝日は08-18（火）と08-22（土）。募集の受付時間は09:00-22:00である。
     */
    async function seedStaffingSettings(t: TestConvex<typeof schema>, ids: StaffingBoardIds) {
      return await t.run(async (ctx) => {
        await ctx.db.patch(ids.shopId, { breakRule: { minWorkMinutes: 360, breakMinutes: 45 } });
        const insertTemplate = (template: {
          shopId?: Id<"shops">;
          name: string;
          weekdays: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
          sortOrder: number;
          appliesToHolidays?: boolean;
          requirements: Doc<"shiftDayTemplates">["requirements"];
        }) =>
          ctx.db.insert("shiftDayTemplates", {
            shopId: template.shopId ?? ids.shopId,
            name: template.name,
            weekdays: template.weekdays,
            sortOrder: template.sortOrder,
            appliesToHolidays: template.appliesToHolidays ?? false,
            requirements: template.requirements,
          });
        // 並び順は登録順ではなくsortOrderで決まることを確かめるため、登録順をずらす。
        const weekendTemplateId = await insertTemplate({
          name: "週末",
          weekdays: ["sat", "sun"],
          sortOrder: 1,
          requirements: { kind: "time", bars: [bar(ids.hallPositionId, "10:00", "20:00")] },
        });
        const weekdayTemplateId = await insertTemplate({
          name: "平日",
          weekdays: ["mon", "tue", "wed"],
          sortOrder: 0,
          requirements: {
            kind: "time",
            bars: [
              bar(ids.hallPositionId, "09:00", "15:00"),
              bar(ids.hallPositionId, "09:00", "15:00"),
              bar(ids.deletedPositionId, "09:00", "15:00"),
              // 募集の受付時間より前に始まるバーは内側だけを数え、完全に外のバーは数えない。
              bar(ids.kitchenPositionId, "07:00", "10:00"),
              bar(ids.hallPositionId, "22:00", "23:00"),
            ],
          },
        });
        const holidayTemplateId = await insertTemplate({
          name: "祝日",
          weekdays: [],
          sortOrder: 2,
          appliesToHolidays: true,
          requirements: { kind: "time", bars: [bar(ids.kitchenPositionId, "11:00", "14:00")] },
        });
        // 店舗が集め方を変える前に保存したテンプレート。必要人数の種類が、募集の集め方（時間指定）と違う。
        const staleTemplateId = await insertTemplate({
          name: "集め方を変える前のテンプレート",
          weekdays: ["thu"],
          sortOrder: 3,
          requirements: { kind: "dateOnly", counts: [{ positionId: ids.hallPositionId, count: 3 }] },
        });
        const deletedTemplateId = await insertTemplate({
          name: "削除するテンプレート",
          weekdays: ["fri"],
          sortOrder: 4,
          requirements: { kind: "time", bars: [bar(ids.hallPositionId, "09:00", "22:00")] },
        });
        await ctx.db.delete(deletedTemplateId);
        const otherTemplateId = await insertTemplate({
          shopId: ids.otherShopId,
          name: "別組織のテンプレート",
          weekdays: ["mon", "fri"],
          sortOrder: 0,
          appliesToHolidays: true,
          requirements: { kind: "time", bars: [bar(ids.otherPositionId, "09:00", "22:00")] },
        });

        for (const date of ["2026-08-16", "2026-08-18", "2026-08-22", "2026-08-24"]) {
          await ctx.db.insert("nationalHolidays", { date, name: "テストの祝日" });
        }

        const templateOverrides: Array<{ shopId: Id<"shops">; date: string; templateId: Id<"shiftDayTemplates"> }> = [
          { shopId: ids.shopId, date: "2026-08-16", templateId: weekendTemplateId }, // 募集期間の前日
          { shopId: ids.shopId, date: "2026-08-17", templateId: weekendTemplateId }, // 募集期間の初日
          { shopId: ids.shopId, date: "2026-08-18", templateId: deletedTemplateId }, // 削除されたテンプレートを指す祝日
          { shopId: ids.shopId, date: "2026-08-19", templateId: deletedTemplateId }, // 削除されたテンプレートを指す平日
          { shopId: ids.shopId, date: "2026-08-24", templateId: weekdayTemplateId }, // 募集期間の翌日
          { shopId: ids.otherShopId, date: "2026-08-21", templateId: otherTemplateId }, // 別組織の店舗
        ];
        for (const override of templateOverrides) {
          await ctx.db.insert("shiftDayTemplateOverrides", { ...override, kind: "template" });
        }
        // 祝日の土曜に、その日だけの必要人数を置く。
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ids.shopId,
          date: "2026-08-22",
          kind: "custom",
          requirements: {
            kind: "time",
            bars: [bar(ids.deletedPositionId, "12:00", "13:00"), bar(ids.defaultPositionId, "12:00", "13:00")],
          },
        });

        // 保存の順はポジションの並び順とずらし、削除済みと別組織のポジションを指す項目も混ぜる。
        await ctx.db.patch(ids.unsubmittedStaffId, {
          positionSkills: [
            { positionId: ids.defaultPositionId, level: "newcomer" },
            { positionId: ids.kitchenPositionId, level: "unavailable" },
            { positionId: ids.deletedPositionId, level: "unavailable" },
            { positionId: ids.otherPositionId, level: "lead" },
            { positionId: ids.hallPositionId, level: "lead" },
          ],
        });
        await ctx.db.patch(ids.submittedStaffId, {
          positionSkills: [{ positionId: ids.hallPositionId, level: "newcomer" }],
        });
        // 項目が削除済みのポジションだけのスタッフは、全ポジションが一人前のスタッフと同じ扱いになる。
        await ctx.db.patch(ids.resubmissionStaffId, {
          positionSkills: [{ positionId: ids.deletedPositionId, level: "lead" }],
        });
        await ctx.db.patch(ids.excludedStaffId, {
          positionSkills: [{ positionId: ids.hallPositionId, level: "lead" }],
        });
        await ctx.db.patch(ids.deletedStaffId, { positionSkills: [{ positionId: ids.hallPositionId, level: "lead" }] });
        return { weekdayTemplateId, weekendTemplateId, holidayTemplateId, staleTemplateId };
      });
    }

    it("未認証ではnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);

      await expect(
        t.query(api.shiftBoard.queries.getShiftBoardStaffing, { ...ids.scope, recruitmentId: ids.recruitmentId }),
      ).resolves.toBeNull();
    });

    it("別組織の管理者と、別組織の店舗・募集の指定にはnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      await seedStaffingSettings(t, ids);
      const asManager = t.withIdentity({ subject: STAFFING_MANAGER });

      await expect(
        t.withIdentity({ subject: STAFFING_OTHER_MANAGER }).query(api.shiftBoard.queries.getShiftBoardStaffing, {
          ...ids.scope,
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
      await expect(
        asManager.query(api.shiftBoard.queries.getShiftBoardStaffing, {
          shopId: ids.otherShopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.otherRecruitmentId,
        }),
      ).resolves.toBeNull();
      // 自分の店舗を指定しても、別組織の店舗の募集は読めない。
      await expect(
        asManager.query(api.shiftBoard.queries.getShiftBoardStaffing, {
          ...ids.scope,
          recruitmentId: ids.otherRecruitmentId,
        }),
      ).resolves.toBeNull();
    });

    it("削除済みの募集ではnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      await t.run(async (ctx) => await ctx.db.patch(ids.recruitmentId, { isDeleted: true }));

      await expect(getStaffing(t, ids)).resolves.toBeNull();
    });

    it("未確定の募集では、日ごとに決めた必要人数と理由、当てられるテンプレート、一人前でないスタッフの属性だけを最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      const templates = await seedStaffingSettings(t, ids);

      const result = await getStaffing(t, ids);

      expect(result).not.toBeNull();
      expect({
        ...result,
        staffProfiles: (result?.staffProfiles ?? []).slice().sort((a, b) => a.staffId.localeCompare(b.staffId)),
      }).toEqual({
        breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
        staffProfiles: [
          {
            staffId: ids.unsubmittedStaffId,
            // 削除済みと別組織のポジションを指す項目を除き、ポジションの並び順（ホール、キッチン、既定）で返す。
            positionSkills: [
              { positionId: ids.hallPositionId, level: "lead" },
              { positionId: ids.kitchenPositionId, level: "unavailable" },
              { positionId: ids.defaultPositionId, level: "newcomer" },
            ],
          },
          { staffId: ids.submittedStaffId, positionSkills: [{ positionId: ids.hallPositionId, level: "newcomer" }] },
        ].sort((a, b) => a.staffId.localeCompare(b.staffId)),
        hasPreviousConfirmedRecruitment: false,
        isLocked: false,
        // 募集の集め方（時間指定）と種類が合うテンプレートだけを、設定した並び順で返す。
        templates: [
          { _id: templates.weekdayTemplateId, name: "平日" },
          { _id: templates.weekendTemplateId, name: "週末" },
          { _id: templates.holidayTemplateId, name: "祝日" },
        ],
        days: [
          // 月曜: その日だけ当てたテンプレートが、曜日のテンプレートより優先する。
          {
            date: "2026-08-17",
            source: "dateTemplate",
            templateId: templates.weekendTemplateId,
            templateName: "週末",
            requirements: { kind: "time", bars: [bar(ids.hallPositionId, "10:00", "20:00")] },
          },
          // 祝日の火曜: 削除されたテンプレートを指す指定を無視し、祝日に使うテンプレートを曜日のテンプレートより優先する。
          {
            date: "2026-08-18",
            source: "holiday",
            templateId: templates.holidayTemplateId,
            templateName: "祝日",
            requirements: { kind: "time", bars: [bar(ids.kitchenPositionId, "11:00", "14:00")] },
          },
          // 水曜: 削除されたテンプレートを指す指定を無視し、曜日のテンプレートを当てる。
          // 削除済みのポジションのバーと受付時間の外のバーを除き、またぐバーは内側だけにする。
          {
            date: "2026-08-19",
            source: "weekday",
            templateId: templates.weekdayTemplateId,
            templateName: "平日",
            requirements: {
              kind: "time",
              bars: [
                bar(ids.kitchenPositionId, "09:00", "10:00"),
                bar(ids.hallPositionId, "09:00", "15:00"),
                bar(ids.hallPositionId, "09:00", "15:00"),
              ],
            },
          },
          // 木曜: 当たるテンプレートの必要人数の種類が募集の集め方と違うため、未設定として扱う。
          {
            date: "2026-08-20",
            source: "weekday",
            templateId: templates.staleTemplateId,
            templateName: "集め方を変える前のテンプレート",
            requirements: null,
          },
          // 金曜: 当たるテンプレートがない。削除されたテンプレートの曜日と、別組織の店舗の指定は使わない。
          unsetDay("2026-08-21", "none"),
          // 祝日の土曜: その日だけの必要人数が、祝日に使うテンプレートと曜日のテンプレートより優先する。
          {
            date: "2026-08-22",
            source: "dateCustom",
            templateId: null,
            templateName: null,
            requirements: { kind: "time", bars: [bar(ids.defaultPositionId, "12:00", "13:00")] },
          },
          {
            date: "2026-08-23",
            source: "weekday",
            templateId: templates.weekendTemplateId,
            templateName: "週末",
            requirements: { kind: "time", bars: [bar(ids.hallPositionId, "10:00", "20:00")] },
          },
        ],
      });
    });

    it("ポジションの削除で、残ったポジションのすべてが担当外になったスタッフは、属性を返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      // 未提出スタッフは、ホールとキッチンが担当外で、既定ではリーダー。提出済みスタッフは、既定だけが担当外。
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.unsubmittedStaffId, {
          positionSkills: [
            { positionId: ids.hallPositionId, level: "unavailable" },
            { positionId: ids.kitchenPositionId, level: "unavailable" },
            { positionId: ids.defaultPositionId, level: "lead" },
          ],
        });
        await ctx.db.patch(ids.submittedStaffId, {
          positionSkills: [{ positionId: ids.defaultPositionId, level: "unavailable" }],
        });
      });

      // 担当できるポジションが残っている間は、保存した項目をそのまま返す。
      const before = await getStaffing(t, ids);
      expect(before).not.toBeNull();
      expect((before?.staffProfiles ?? []).slice().sort((a, b) => a.staffId.localeCompare(b.staffId))).toEqual(
        [
          {
            staffId: ids.unsubmittedStaffId,
            positionSkills: [
              { positionId: ids.hallPositionId, level: "unavailable" },
              { positionId: ids.kitchenPositionId, level: "unavailable" },
              { positionId: ids.defaultPositionId, level: "lead" },
            ],
          },
          {
            staffId: ids.submittedStaffId,
            positionSkills: [{ positionId: ids.defaultPositionId, level: "unavailable" }],
          },
        ].sort((a, b) => a.staffId.localeCompare(b.staffId)),
      );

      // 未提出スタッフが担当できる唯一のポジションだった既定を削除する。
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.defaultPositionId, { isDeleted: true });
      });

      // 未提出スタッフは残ったポジションのすべてが入れないになり、提出済みスタッフは項目が削除済みだけになる。
      const after = await getStaffing(t, ids);
      expect(after).not.toBeNull();
      expect(after?.staffProfiles).toEqual([]);
    });

    it("何も設定していない店舗では、募集期間の全日を未設定として返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);

      await expect(getStaffing(t, ids)).resolves.toEqual({
        breakRule: null,
        staffProfiles: [],
        hasPreviousConfirmedRecruitment: false,
        isLocked: false,
        templates: [],
        days: PERIOD_DATES.map((date) => unsetDay(date, "none")),
      });
    });

    it("募集の集め方が店舗のテンプレートと違う種類の場合は、どの日も未設定として扱い、当てられるテンプレートを返さない", async () => {
      const t = convexTest(schema, modules);
      // テンプレートは時間指定で作ってあり、募集はパターン選択で集めている。
      const ids = await seedStaffingBoard(t, { submissionPattern: SHIFT_TYPE_BOARD_PATTERN });
      const templates = await seedStaffingSettings(t, ids);

      const result = await getStaffing(t, ids);

      expect(result?.templates).toEqual([]);
      expect(result?.days).toEqual([
        {
          date: "2026-08-17",
          source: "dateTemplate",
          templateId: templates.weekendTemplateId,
          templateName: "週末",
          requirements: null,
        },
        {
          date: "2026-08-18",
          source: "holiday",
          templateId: templates.holidayTemplateId,
          templateName: "祝日",
          requirements: null,
        },
        {
          date: "2026-08-19",
          source: "weekday",
          templateId: templates.weekdayTemplateId,
          templateName: "平日",
          requirements: null,
        },
        {
          date: "2026-08-20",
          source: "weekday",
          templateId: templates.staleTemplateId,
          templateName: "集め方を変える前のテンプレート",
          requirements: null,
        },
        unsetDay("2026-08-21", "none"),
        { date: "2026-08-22", source: "dateCustom", templateId: null, templateName: null, requirements: null },
        {
          date: "2026-08-23",
          source: "weekday",
          templateId: templates.weekendTemplateId,
          templateName: "週末",
          requirements: null,
        },
      ]);
    });

    it("パターン選択の募集では、募集の勤務パターンにあるものだけを設定順で返し、削除済みのポジションの人数を除く", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, { submissionPattern: SHIFT_TYPE_BOARD_PATTERN });
      const templateId = await t.run(async (ctx) =>
        ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "毎日",
          weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: {
            kind: "shiftType",
            options: [
              { optionId: "late", counts: [{ positionId: ids.kitchenPositionId, count: 1 }] },
              // 募集を作ったあとで店舗が足した勤務パターン。募集にはない。
              { optionId: "night", counts: [{ positionId: ids.hallPositionId, count: 4 }] },
              {
                optionId: "early",
                counts: [
                  { positionId: ids.deletedPositionId, count: 2 },
                  { positionId: ids.hallPositionId, count: 2 },
                ],
              },
            ],
          },
        }),
      );

      const result = await getStaffing(t, ids);

      expect(result?.templates).toEqual([{ _id: templateId, name: "毎日" }]);
      expect(result?.days).toEqual(
        PERIOD_DATES.map((date) => ({
          date,
          source: "weekday",
          templateId,
          templateName: "毎日",
          requirements: {
            kind: "shiftType",
            options: [
              { optionId: "early", counts: [{ positionId: ids.hallPositionId, count: 2 }] },
              { optionId: "late", counts: [{ positionId: ids.kitchenPositionId, count: 1 }] },
            ],
          },
        })),
      );
    });

    it("日付選択の募集では、1日分のポジション別の人数を返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, { submissionPattern: { kind: "dateOnly" } });
      const templateId = await t.run(async (ctx) =>
        ctx.db.insert("shiftDayTemplates", {
          shopId: ids.shopId,
          name: "月曜",
          weekdays: ["mon"],
          sortOrder: 0,
          appliesToHolidays: false,
          requirements: {
            kind: "dateOnly",
            counts: [
              { positionId: ids.hallPositionId, count: 3 },
              { positionId: ids.deletedPositionId, count: 1 },
            ],
          },
        }),
      );

      const result = await getStaffing(t, ids);

      expect(result?.days).toEqual([
        {
          date: "2026-08-17",
          source: "weekday",
          templateId,
          templateName: "月曜",
          requirements: { kind: "dateOnly", counts: [{ positionId: ids.hallPositionId, count: 3 }] },
        },
        ...PERIOD_DATES.slice(1).map((date) => unsetDay(date, "none")),
      ]);
    });

    it("確定済みの募集では、いまのテンプレートと指定を使わず、確定時に保存した必要人数だけを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, { status: "confirmed" });
      const templates = await seedStaffingSettings(t, ids);
      await t.run(async (ctx) => {
        const insertSnapshot = (snapshot: {
          recruitmentId?: Id<"recruitments">;
          shopId?: Id<"shops">;
          date: string;
          templateName: string | null;
          requirements: Doc<"recruitmentStaffingSnapshots">["requirements"];
        }) =>
          ctx.db.insert("recruitmentStaffingSnapshots", {
            recruitmentId: snapshot.recruitmentId ?? ids.recruitmentId,
            shopId: snapshot.shopId ?? ids.shopId,
            date: snapshot.date,
            templateName: snapshot.templateName,
            requirements: snapshot.requirements,
          });
        await insertSnapshot({
          date: "2026-08-19",
          templateName: "確定したときの平日",
          requirements: {
            kind: "time",
            bars: [bar(ids.hallPositionId, "09:00", "12:00"), bar(ids.deletedPositionId, "09:00", "12:00")],
          },
        });
        // その日だけの必要人数で確定した日は、テンプレートの名前を持たない。
        await insertSnapshot({
          date: "2026-08-17",
          templateName: null,
          requirements: { kind: "time", bars: [bar(ids.kitchenPositionId, "17:00", "22:00")] },
        });
        // 当たったテンプレートの種類が募集の集め方と違った日は、テンプレートの名前だけを持つ。
        await insertSnapshot({
          date: "2026-08-20",
          templateName: "集め方を変える前のテンプレート",
          requirements: null,
        });
        // 別組織の募集の保存は、同じ日付でも使わない。
        await insertSnapshot({
          recruitmentId: ids.otherRecruitmentId,
          shopId: ids.otherShopId,
          date: "2026-08-21",
          templateName: "別組織のテンプレート",
          requirements: { kind: "time", bars: [bar(ids.otherPositionId, "09:00", "22:00")] },
        });
      });

      const result = await getStaffing(t, ids);

      expect(result?.isLocked).toBe(true);
      expect(result?.templates).toEqual([
        { _id: templates.weekdayTemplateId, name: "平日" },
        { _id: templates.weekendTemplateId, name: "週末" },
        { _id: templates.holidayTemplateId, name: "祝日" },
      ]);
      expect(result?.days).toEqual([
        {
          date: "2026-08-17",
          source: "confirmed",
          templateId: null,
          templateName: null,
          requirements: { kind: "time", bars: [bar(ids.kitchenPositionId, "17:00", "22:00")] },
        },
        // いまの設定では祝日のテンプレートが当たる日でも、確定時に保存がなければ未設定のままにする。
        unsetDay("2026-08-18", "confirmed"),
        {
          date: "2026-08-19",
          source: "confirmed",
          templateId: null,
          templateName: "確定したときの平日",
          requirements: { kind: "time", bars: [bar(ids.hallPositionId, "09:00", "12:00")] },
        },
        {
          date: "2026-08-20",
          source: "confirmed",
          templateId: null,
          templateName: "集め方を変える前のテンプレート",
          requirements: null,
        },
        unsetDay("2026-08-21", "confirmed"),
        unsetDay("2026-08-22", "confirmed"),
        unsetDay("2026-08-23", "confirmed"),
      ]);
    });

    it.each([
      {
        name: "開始日が前の確定済みの募集がある",
        previous: { periodStart: "2026-08-03", periodEnd: "2026-08-16" },
        expected: true,
      },
      {
        name: "開始日が前の募集が未確定",
        previous: { periodStart: "2026-08-03", periodEnd: "2026-08-16", status: "open" as const },
        expected: false,
      },
      {
        name: "開始日が前の確定済みの募集が削除済み",
        previous: { periodStart: "2026-08-03", periodEnd: "2026-08-16", isDeleted: true },
        expected: false,
      },
      {
        name: "確定済みの募集の開始日が後",
        previous: { periodStart: "2026-08-24", periodEnd: "2026-08-30" },
        expected: false,
      },
      {
        name: "確定済みの募集が別組織の店舗のもの",
        previous: { periodStart: "2026-08-03", periodEnd: "2026-08-16", inOtherShop: true },
        expected: false,
      },
    ])("$name 場合、hasPreviousConfirmedRecruitmentは$expected", async ({ previous, expected }) => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      const { inOtherShop, ...recruitment } = { inOtherShop: false, ...previous };
      await seedRecruitment(t, { shopId: inOtherShop ? ids.otherShopId : ids.shopId, ...recruitment });

      const result = await t
        .withIdentity({ subject: STAFFING_MANAGER })
        .query(api.shiftBoard.queries.getShiftBoardStaffing, { ...ids.scope, recruitmentId: ids.recruitmentId });

      expect(result).not.toBeNull();
      expect(result?.hasPreviousConfirmedRecruitment).toBe(expected);
    });
  });

  describe("getProvisionalAssignments", () => {
    const getProvisional = (t: TestConvex<typeof schema>, ids: StaffingBoardIds) =>
      t.withIdentity({ subject: STAFFING_MANAGER }).query(api.shiftBoard.queries.getProvisionalAssignments, {
        ...ids.scope,
        recruitmentId: ids.recruitmentId,
      });
    const seedPrevious = (
      t: TestConvex<typeof schema>,
      ids: StaffingBoardIds,
      options?: { submissionPattern?: BoardPattern },
    ) =>
      seedRecruitment(t, {
        shopId: ids.shopId,
        periodStart: "2026-08-03",
        periodEnd: "2026-08-16",
        ...(options?.submissionPattern ? { submissionPattern: options.submissionPattern } : {}),
      });

    it("未認証ではnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);

      await expect(
        t.query(api.shiftBoard.queries.getProvisionalAssignments, { ...ids.scope, recruitmentId: ids.recruitmentId }),
      ).resolves.toBeNull();
    });

    it("別組織の管理者と、別組織の店舗・募集の指定にはnullを返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      const previousRecruitmentId = await seedPrevious(t, ids);
      await seedAssignments(t, previousRecruitmentId, [
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-10",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
        },
      ]);
      const asManager = t.withIdentity({ subject: STAFFING_MANAGER });

      await expect(
        t.withIdentity({ subject: STAFFING_OTHER_MANAGER }).query(api.shiftBoard.queries.getProvisionalAssignments, {
          ...ids.scope,
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
      await expect(
        asManager.query(api.shiftBoard.queries.getProvisionalAssignments, {
          shopId: ids.otherShopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.otherRecruitmentId,
        }),
      ).resolves.toBeNull();
      await expect(
        asManager.query(api.shiftBoard.queries.getProvisionalAssignments, {
          ...ids.scope,
          recruitmentId: ids.otherRecruitmentId,
        }),
      ).resolves.toBeNull();
    });

    it("未提出のシフト対象スタッフだけに、前回確定の同じ曜日の最後の日の勤務を写し、定休日を除く", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, { shopClosedDates: ["2026-08-19"] });
      const previousRecruitmentId = await seedPrevious(t, ids);
      const monday = { date: "2026-08-10", startTime: "10:00", endTime: "18:00", positionId: ids.hallPositionId };
      await seedAssignments(t, previousRecruitmentId, [
        // 前回の期間に月曜日は2回ある。最後の月曜日（08-10）だけを写す。
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-03",
          startTime: "09:00",
          endTime: "12:00",
          positionId: ids.kitchenPositionId,
        },
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-10",
          startTime: "12:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
          breaks: [{ startTime: "14:00", endTime: "14:30" }],
        },
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-11",
          startTime: "09:00",
          endTime: "13:00",
          positionId: ids.defaultPositionId,
        },
        // 今回の水曜日（08-19）は定休日なので写さない。
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-12",
          startTime: "09:00",
          endTime: "13:00",
          positionId: ids.defaultPositionId,
        },
        // 最後の木曜日（08-13）に勤務がなければ、前の木曜日（08-06）の勤務は写さない。
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-06",
          startTime: "09:00",
          endTime: "13:00",
          positionId: ids.defaultPositionId,
        },
        // 再提出待ちのスタッフは未提出として扱う。
        { ...monday, staffId: ids.resubmissionStaffId },
        // 提出済み、シフト対象外、削除済みのスタッフには写さない。
        { ...monday, staffId: ids.submittedStaffId },
        { ...monday, staffId: ids.excludedStaffId },
        { ...monday, staffId: ids.deletedStaffId },
      ]);

      const result = await getProvisional(t, ids);

      expect(result).not.toBeNull();
      expect(byDateAndStaff(result ?? [])).toStrictEqual(
        byDateAndStaff([
          {
            staffId: ids.unsubmittedStaffId,
            date: "2026-08-17",
            startTime: "12:00",
            endTime: "18:00",
            positionId: ids.hallPositionId,
            breaks: [{ startTime: "14:00", endTime: "14:30" }],
          },
          { ...monday, staffId: ids.resubmissionStaffId, date: "2026-08-17" },
          {
            staffId: ids.unsubmittedStaffId,
            date: "2026-08-18",
            startTime: "09:00",
            endTime: "13:00",
            positionId: ids.defaultPositionId,
          },
        ]),
      );
    });

    it("確定済みの募集のうち、開始日が今回より前で最も新しいものを前回として使う", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      const olderRecruitmentId = await seedRecruitment(t, {
        shopId: ids.shopId,
        periodStart: "2026-07-20",
        periodEnd: "2026-07-26",
      });
      const previousRecruitmentId = await seedPrevious(t, ids);
      const laterRecruitmentId = await seedRecruitment(t, {
        shopId: ids.shopId,
        periodStart: "2026-08-24",
        periodEnd: "2026-08-30",
      });
      const base = { staffId: ids.unsubmittedStaffId, positionId: ids.hallPositionId };
      await seedAssignments(t, olderRecruitmentId, [
        { ...base, date: "2026-07-20", startTime: "09:00", endTime: "12:00" },
      ]);
      await seedAssignments(t, previousRecruitmentId, [
        { ...base, date: "2026-08-10", startTime: "13:00", endTime: "17:00" },
      ]);
      await seedAssignments(t, laterRecruitmentId, [
        { ...base, date: "2026-08-24", startTime: "18:00", endTime: "22:00" },
      ]);

      await expect(getProvisional(t, ids)).resolves.toStrictEqual([
        { ...base, date: "2026-08-17", startTime: "13:00", endTime: "17:00" },
      ]);
    });

    it("確定済みの募集では、空を返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, { status: "confirmed" });
      const previousRecruitmentId = await seedPrevious(t, ids);
      await seedAssignments(t, previousRecruitmentId, [
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-10",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.hallPositionId,
        },
      ]);

      await expect(getProvisional(t, ids)).resolves.toEqual([]);
    });

    it.each([
      { name: "前の募集がない", previous: null },
      { name: "前の募集が未確定", previous: { status: "open" as const } },
      { name: "前の確定済みの募集が削除済み", previous: { isDeleted: true } },
      { name: "前の確定済みの募集と募集方式が違う", previous: { submissionPattern: { kind: "dateOnly" as const } } },
    ])("$name 場合は、空を返す", async ({ previous }) => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      if (previous) {
        const previousRecruitmentId = await seedRecruitment(t, {
          shopId: ids.shopId,
          periodStart: "2026-08-03",
          periodEnd: "2026-08-16",
          ...previous,
        });
        await seedAssignments(t, previousRecruitmentId, [
          {
            staffId: ids.unsubmittedStaffId,
            date: "2026-08-10",
            startTime: "10:00",
            endTime: "18:00",
            positionId: ids.hallPositionId,
          },
        ]);
      }

      await expect(getProvisional(t, ids)).resolves.toEqual([]);
    });

    it("時間指定では、今回の受付時間の外に出る勤務を除く", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, {
        submissionPattern: { kind: "time", startTime: "10:00", endTime: "20:00" },
      });
      const previousRecruitmentId = await seedPrevious(t, ids);
      const base = { staffId: ids.unsubmittedStaffId, positionId: ids.hallPositionId };
      await seedAssignments(t, previousRecruitmentId, [
        { ...base, date: "2026-08-10", startTime: "09:30", endTime: "13:00" },
        { ...base, date: "2026-08-11", startTime: "17:00", endTime: "20:30" },
        { ...base, date: "2026-08-12", startTime: "10:00", endTime: "20:00" },
      ]);

      await expect(getProvisional(t, ids)).resolves.toStrictEqual([
        { ...base, date: "2026-08-19", startTime: "10:00", endTime: "20:00" },
      ]);
    });

    it("パターン選択では、今回の募集に同じ時間で残っている勤務パターンの勤務だけを写す", async () => {
      const early = { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 };
      const late = { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 };
      const night = { id: "night", name: "夜番", startTime: "22:00", endTime: "26:00", sortOrder: 2 };
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, {
        // 今回の募集では夜番が消え、遅番の時間が変わっている。
        submissionPattern: { kind: "shiftType", options: [early, { ...late, startTime: "16:00" }] },
      });
      const previousRecruitmentId = await seedPrevious(t, ids, {
        submissionPattern: { kind: "shiftType", options: [early, late, night] },
      });
      const base = { staffId: ids.unsubmittedStaffId, positionId: ids.hallPositionId };
      await seedAssignments(t, previousRecruitmentId, [
        { ...base, date: "2026-08-10", startTime: "09:00", endTime: "15:00", optionId: "early" },
        { ...base, date: "2026-08-11", startTime: "22:00", endTime: "26:00", optionId: "night" },
        { ...base, date: "2026-08-12", startTime: "15:00", endTime: "22:00", optionId: "late" },
      ]);

      await expect(getProvisional(t, ids)).resolves.toStrictEqual([
        { ...base, date: "2026-08-17", startTime: "09:00", endTime: "15:00", optionId: "early" },
      ]);
    });

    it("日付選択でも、前回確定の同じ曜日の勤務を写す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t, { submissionPattern: { kind: "dateOnly" } });
      const previousRecruitmentId = await seedPrevious(t, ids, { submissionPattern: { kind: "dateOnly" } });
      const base = { staffId: ids.unsubmittedStaffId, positionId: ids.hallPositionId };
      await seedAssignments(t, previousRecruitmentId, [
        { ...base, date: "2026-08-15", startTime: "09:00", endTime: "22:00" },
      ]);

      await expect(getProvisional(t, ids)).resolves.toStrictEqual([
        { ...base, date: "2026-08-22", startTime: "09:00", endTime: "22:00" },
      ]);
    });

    it("削除済みのポジションの勤務は、既定のポジションへ置き換えて写す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedStaffingBoard(t);
      const previousRecruitmentId = await seedPrevious(t, ids);
      await seedAssignments(t, previousRecruitmentId, [
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-10",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.deletedPositionId,
        },
      ]);

      await expect(getProvisional(t, ids)).resolves.toStrictEqual([
        {
          staffId: ids.unsubmittedStaffId,
          date: "2026-08-17",
          startTime: "10:00",
          endTime: "18:00",
          positionId: ids.defaultPositionId,
        },
      ]);
    });
  });
});

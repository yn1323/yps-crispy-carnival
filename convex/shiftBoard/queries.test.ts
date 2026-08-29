import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";

const QUERY_REFRESH_DAY_KEY = "2026-07-22";

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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

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
      recruitmentId: ids.recruitmentId,
      refreshDayKey: QUERY_REFRESH_DAY_KEY,
    });

    expect(result).toMatchObject({
      canWriteBusinessData: false,
      businessWriteBlockReason: kind === "unknown" ? "usageLimitEvaluationUnavailable" : "usageLimitExceeded",
      recruitment: { _id: ids.recruitmentId },
    });
  });

  it("billing state未移行中は従来どおりシフト操作を有効表示する", async () => {
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
        recruitmentId: ids.recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result).toMatchObject({
      canWriteBusinessData: true,
      businessWriteBlockReason: null,
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
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.staffs.map((s) => s._id)).toEqual([includedStaffId]);
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
      recruitmentId: ids.recruitmentId,
      // rolling deploy中の旧clientが未来のasOfDateを渡しても、server時刻より早くtombstoneを取得できない。
      asOfDate: "2026-07-21",
    });
    vi.setSystemTime(Date.parse("2026-07-20T15:00:00.000Z"));
    const past = await actor.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
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
        submittedAt: Date.now(),
      });
      return { shopId, recruitmentId, staffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_all_off" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
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
      },
    ]);
  });

  it("日ごと提出の希望日をシフト表用データとして返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_date_only_board", shopName: "テスト店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "日ごとスタッフ",
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
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.requestedDates).toEqual([{ staffId, date: "2026-04-03" }]);
    expect(result?.requestedSlots).toEqual([]);
  });

  it("勤務区分募集のsnapshotとoptionIdつき希望・割当を返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId, positionId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_shift_type_board", shopName: "テスト店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "勤務区分スタッフ",
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

  it("下書き保存時点で提出済みだったスタッフを返す", async () => {
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
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: staffBeforeDraftId,
        firstSubmittedAt: 1000,
        submittedAt: 3000,
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
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    const staffById = new Map(result?.staffs.map((s) => [s._id, s]));
    expect(staffById.get(staffBeforeDraftId)?.wasSubmittedAtDraft).toBe(true);
    expect(staffById.get(staffAfterDraftId)?.wasSubmittedAtDraft).toBe(false);
    expect(result?.recruitment.draftSavedAt).toBe(2000);
  });

  it("draftSavedAtがない既存データは保存済み割当の作成時刻を使う", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_legacy_draft", shopName: "テスト店舗" });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "既存スタッフ",
        email: "legacy@example.com",
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
      const positionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        submittedAt: 1,
      });
      await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId,
        date: "2026-04-01",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      return { shopId, recruitmentId, staffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_legacy_draft" })
      .query(api.shiftBoard.queries.getShiftBoardData, {
        shopId,
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.recruitment.draftSavedAt).toBeTypeOf("number");
    expect(result?.staffs.find((s) => s._id === staffId)?.wasSubmittedAtDraft).toBe(true);
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
        recruitmentId,
        refreshDayKey: QUERY_REFRESH_DAY_KEY,
      });

    expect(result?.timeRange.editableStartMinutes).toBe(330);
    expect(result?.timeRange.editableEndMinutes).toBe(1350);
  });
});

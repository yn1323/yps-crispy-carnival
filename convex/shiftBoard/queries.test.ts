import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("shiftBoard/queries", () => {
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

  it("閲覧のみ管理者にはシフトデータを返しつつ書き込み不可理由を返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId } = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "readonly_shift_board",
        shopName: "閲覧店舗",
        plan: "pro",
      });
      await ctx.db.patch(seeded.memberId, { status: "readOnly" });
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
      return { shopId: seeded.shopId, recruitmentId };
    });

    const result = await t
      .withIdentity({ subject: "readonly_shift_board" })
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

    expect(result).toMatchObject({
      canWriteBusinessData: false,
      businessWriteBlockReason: "memberReadOnly",
      recruitment: { _id: recruitmentId },
    });
  });

  it("シフト対象外スタッフはシフト表に含めない", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, includedStaffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_excluded", shopName: "テスト店舗" });
      const includedStaffId = await ctx.db.insert("staffs", {
        shopId,
        name: "通常スタッフ",
        email: "normal@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId,
        name: "対象外スタッフ",
        email: "excluded@example.com",
        excludedFromShift: true,
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
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { shopId, recruitmentId, includedStaffId };
    });

    const result = await t
      .withIdentity({ subject: "manager_excluded" })
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

    expect(result?.staffs.map((s) => s._id)).toEqual([includedStaffId]);
  });

  it("過去募集では削除済み割当スタッフをtombstoneで返し、現在の募集候補には含めない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_removed_history", shopName: "履歴店舗" });
      const staffId = await ctx.db.insert("staffs", {
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
      const createRecruitment = async (periodStart: string, periodEnd: string) => {
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart,
          periodEnd,
          deadline: periodStart,
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: periodStart,
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
        return recruitmentId;
      };
      return {
        shopId,
        staffId,
        pastRecruitmentId: await createRecruitment("2020-01-01", "2020-01-01"),
        currentRecruitmentId: await createRecruitment("2099-01-01", "2099-01-01"),
      };
    });
    const actor = t.withIdentity({ subject: "manager_removed_history" });

    const past = await actor.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      recruitmentId: ids.pastRecruitmentId,
    });
    const current = await actor.query(api.shiftBoard.queries.getShiftBoardData, {
      shopId: ids.shopId,
      recruitmentId: ids.currentRecruitmentId,
    });

    expect(past?.staffs).toContainEqual({
      _id: ids.staffId,
      name: "削除済みスタッフ",
      isRemoved: true,
      isSubmitted: true,
      createdAt: expect.any(Number),
      wasSubmittedAtDraft: false,
    });
    expect(past?.shiftAssignments).toHaveLength(1);
    expect(current?.staffs.map((staff) => staff._id)).not.toContain(ids.staffId);
    expect(current?.shiftAssignments).toHaveLength(1);
  });

  it("全休み提出は提出済みとして返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_all_off", shopName: "テスト店舗" });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "全休みスタッフ",
        email: "all-off@example.com",
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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

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
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "日ごとスタッフ",
        email: "date-only@example.com",
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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

    expect(result?.requestedDates).toEqual([{ staffId, date: "2026-04-03" }]);
    expect(result?.requestedSlots).toEqual([]);
  });

  it("勤務区分募集のsnapshotとoptionIdつき希望・割当を返す", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId, positionId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_shift_type_board", shopName: "テスト店舗" });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "勤務区分スタッフ",
        email: "shift-type@example.com",
        isDeleted: false,
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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

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
      const staffBeforeDraftId = await ctx.db.insert("staffs", {
        shopId,
        name: "保存前提出",
        email: "before@example.com",
        isDeleted: false,
      });
      const staffAfterDraftId = await ctx.db.insert("staffs", {
        shopId,
        name: "保存後提出",
        email: "after@example.com",
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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

    const staffById = new Map(result?.staffs.map((s) => [s._id, s]));
    expect(staffById.get(staffBeforeDraftId)?.wasSubmittedAtDraft).toBe(true);
    expect(staffById.get(staffAfterDraftId)?.wasSubmittedAtDraft).toBe(false);
    expect(result?.recruitment.draftSavedAt).toBe(2000);
  });

  it("draftSavedAtがない既存データは保存済み割当の作成時刻を使う", async () => {
    const t = convexTest(schema, modules);
    const { shopId, recruitmentId, staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, { subject: "manager_legacy_draft", shopName: "テスト店舗" });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "既存スタッフ",
        email: "legacy@example.com",
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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

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
      .query(api.shiftBoard.queries.getShiftBoardData, { shopId, recruitmentId });

    expect(result?.timeRange.editableStartMinutes).toBe(330);
    expect(result?.timeRange.editableEndMinutes).toBe(1350);
  });
});

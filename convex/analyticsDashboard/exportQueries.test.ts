import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { EXPORT_ASSIGNMENT_LIMIT, EXPORT_RECRUITMENT_LIMIT } from "./exportQueries";
import { getOrganizationExportRef, getShopExportRef } from "./refs";

const AS_OF = Date.UTC(2026, 8, 20, 3);

async function seedRecruitment(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  periodStart = "2026-09-10",
  overrides: Partial<{ status: "open" | "confirmed"; confirmedAt: number; isDeleted: boolean }> = {},
) {
  return await ctx.db.insert("recruitments", {
    shopId,
    periodStart,
    periodEnd: "2026-09-16",
    deadline: "2026-09-05",
    shopClosedDates: ["2026-09-12"],
    status: overrides.status ?? "open",
    confirmedAt: overrides.confirmedAt,
    isDeleted: overrides.isDeleted ?? false,
    submissionPattern: {
      kind: "shiftType",
      options: [{ id: "early", name: "山田さん専用枠", startTime: "09:00", endTime: "15:00", sortOrder: 0 }],
    },
  });
}

async function seedSubmission(
  ctx: MutationCtx,
  args: { recruitmentId: Id<"recruitments">; staffId: Id<"staffs">; firstSubmittedAt: number },
) {
  const submissionId = await ctx.db.insert("shiftSubmissions", {
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    firstSubmittedAt: args.firstSubmittedAt,
    submittedAt: args.firstSubmittedAt,
  });
  await ctx.db.insert("shiftSubmissionDateNotes", {
    submissionId,
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    date: "2026-09-10",
    note: "通院のため午前は難しいです",
  });
}

async function seedAssignment(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; recruitmentId: Id<"recruitments">; staffId: Id<"staffs">; date?: string },
) {
  const positionId = await ctx.db.insert("positions", {
    shopId: args.shopId,
    name: "ホール",
    color: "#3b82f6",
    sortOrder: 0,
    isDefault: true,
    isDeleted: false,
  });
  await ctx.db.insert("shiftAssignments", {
    recruitmentId: args.recruitmentId,
    staffId: args.staffId,
    date: args.date ?? "2026-09-10",
    startTime: "09:00",
    endTime: "15:00",
    positionId,
  });
}

describe("analyticsDashboardの分析用JSONの元データ", () => {
  it("人物名・メールアドレス・パターン名・日付メモを返さず、スタッフ・ユーザー・提出・割当をIDで返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "仮名化テスト店舗");
      const userId = await seedUser(ctx, "export-linked", "hanako@example.com");
      const staffId = await seedStaff(ctx, { shopId, name: "山田 花子", email: "hanako@example.com", userId });
      const otherId = await seedStaff(ctx, { shopId, name: "佐藤 次郎", email: "jiro@example.com" });
      const recruitmentId = await seedRecruitment(ctx, shopId, "2026-09-10", {
        status: "confirmed",
        confirmedAt: Date.UTC(2026, 8, 8),
      });
      // 期限当日（JST）の提出と、期限翌日の提出。
      await seedSubmission(ctx, { recruitmentId, staffId, firstSubmittedAt: Date.UTC(2026, 8, 5, 14) });
      await seedSubmission(ctx, { recruitmentId, staffId: otherId, firstSubmittedAt: Date.UTC(2026, 8, 5, 16) });
      await seedAssignment(ctx, { shopId, recruitmentId, staffId });
      return { shopId, userId, staffId, otherId };
    });

    const result = await t.query(getShopExportRef, { shopId: ids.shopId, asOf: AS_OF });

    const serialized = JSON.stringify(result);
    for (const secret of ["山田 花子", "佐藤 次郎", "hanako@example.com", "jiro@example.com", "山田さん専用枠", "通院"])
      expect(serialized).not.toContain(secret);
    expect(result?.members.map((member) => member.personKey).sort()).toEqual([ids.staffId, ids.otherId].sort());
    expect(Object.fromEntries((result?.members ?? []).map((member) => [member.staffId, member.userId]))).toEqual({
      [ids.staffId]: ids.userId,
      [ids.otherId]: null,
    });
    expect(result?.recruitments[0]).toMatchObject({
      submissionPattern: { kind: "shiftType", options: [{ startTime: "09:00", endTime: "15:00" }] },
      shopClosedDateCount: 1,
      confirmedBeforeStart: true,
      assignment: { assignedStaffCount: 1, assignmentCount: 1, isTruncated: false },
    });
    const submissions = Object.fromEntries(
      (result?.recruitments[0].submissions ?? []).map((submission) => [submission.staffId, submission]),
    );
    expect(submissions[ids.staffId]).toMatchObject({ firstSubmittedByDeadline: true, assigned: true });
    expect(submissions[ids.otherId]).toMatchObject({ firstSubmittedByDeadline: false, assigned: false });
  });

  it("同じメールアドレスの人物は別の組織でも同じ照合キーになり、スタッフIDは店舗ごとに返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const firstShopId = await seedShop(ctx, "最初の店舗");
      const firstStaffId = await seedStaff(ctx, { shopId: firstShopId, name: "共通", email: "Same@Example.com" });
      const secondShopId = await seedShop(ctx, "別組織の店舗");
      const sameStaffId = await seedStaff(ctx, { shopId: secondShopId, name: "共通", email: "same@example.com" });
      const otherStaffId = await seedStaff(ctx, { shopId: secondShopId, name: "別人", email: "other@example.com" });
      return { firstShopId, secondShopId, firstStaffId, sameStaffId, otherStaffId };
    });

    const first = await t.query(getShopExportRef, { shopId: ids.firstShopId, asOf: AS_OF });
    const second = await t.query(getShopExportRef, { shopId: ids.secondShopId, asOf: AS_OF });

    expect(first?.shop.organizationId).not.toBe(second?.shop.organizationId);
    expect(first?.members.map((member) => member.personKey)).toEqual([ids.firstStaffId]);
    expect(Object.fromEntries((second?.members ?? []).map((member) => [member.staffId, member.personKey]))).toEqual({
      [ids.sameStaffId]: ids.firstStaffId,
      [ids.otherStaffId]: ids.otherStaffId,
    });
  });

  it("削除済み・所属不整合のスタッフは返さず、その提出はスタッフIDと照合キーなしで数える", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "所属確認の店舗");
      const activeId = await seedStaff(ctx, { shopId, name: "在籍", email: "active@example.com" });
      const deletedId = await seedStaff(ctx, { shopId, name: "退職", email: "left@example.com", isDeleted: true });
      const otherShopId = await seedShop(ctx, "別の店舗");
      const mismatchedId = await seedStaff(ctx, { shopId: otherShopId, name: "不整合", email: "x@example.com" });
      const shop = await ctx.db.get(shopId);
      if (!shop) throw new Error("shop not found");
      // 店舗IDだけを書き換え、組織と人物が一致しないスタッフを作る。
      await ctx.db.patch(mismatchedId, { shopId });
      const recruitmentId = await seedRecruitment(ctx, shopId);
      await seedSubmission(ctx, { recruitmentId, staffId: deletedId, firstSubmittedAt: Date.UTC(2026, 8, 1) });
      return { shopId, activeId };
    });

    const result = await t.query(getShopExportRef, { shopId: ids.shopId, asOf: AS_OF });

    expect(result?.members.map((member) => member.personKey)).toEqual([ids.activeId]);
    expect(result?.recruitments[0].submissions).toEqual([expect.objectContaining({ staffId: null, personKey: null })]);
  });

  it("募集と割当は上限で打ち切り、打ち切ったことを返す。削除済みの店舗は返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "上限確認の店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "担当", email: "staff@example.com" });
      let latestId: Id<"recruitments"> | null = null;
      for (let index = 0; index <= EXPORT_RECRUITMENT_LIMIT; index += 1)
        latestId = await seedRecruitment(
          ctx,
          shopId,
          `2026-0${1 + (index % 9)}-${String(10 + index).padStart(2, "0")}`,
        );
      if (!latestId) throw new Error("recruitment not found");
      const deletedShopId = await seedShop(ctx, "削除済みの店舗");
      await ctx.db.patch(deletedShopId, { isDeleted: true });
      return { shopId, staffId, deletedShopId };
    });
    await t.run(async (ctx) => {
      const latest = await ctx.db
        .query("recruitments")
        .withIndex("by_shopId_and_isDeleted_and_periodStart", (q) => q.eq("shopId", ids.shopId).eq("isDeleted", false))
        .order("desc")
        .first();
      if (!latest) throw new Error("recruitment not found");
      for (let index = 0; index <= EXPORT_ASSIGNMENT_LIMIT; index += 1)
        await seedAssignment(ctx, { shopId: ids.shopId, recruitmentId: latest._id, staffId: ids.staffId });
    });

    const result = await t.query(getShopExportRef, { shopId: ids.shopId, asOf: AS_OF });

    expect(result?.recruitments).toHaveLength(EXPORT_RECRUITMENT_LIMIT);
    expect(result?.recruitmentsTruncated).toBe(true);
    expect(result?.recruitments[0].assignment).toEqual({
      assignedStaffCount: 1,
      assignmentCount: EXPORT_ASSIGNMENT_LIMIT,
      isTruncated: true,
    });
    await expect(t.query(getShopExportRef, { shopId: ids.deletedShopId, asOf: AS_OF })).resolves.toBeNull();
  });

  it("組織は概要と現在の店舗を返し、削除済みの組織は返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "組織の店舗");
      const shop = await ctx.db.get(shopId);
      if (!shop) throw new Error("shop not found");
      const deletedShopId = await ctx.db.insert("shops", {
        organizationId: shop.organizationId,
        name: "閉店した店舗",
        submissionPattern: { kind: "dateOnly" },
        regularClosedDays: [],
        isDeleted: true,
      });
      const deletedOrganizationShopId = await seedShop(ctx, "削除済み組織の店舗");
      const deletedOrganizationShop = await ctx.db.get(deletedOrganizationShopId);
      if (!deletedOrganizationShop) throw new Error("shop not found");
      await ctx.db.patch(deletedOrganizationShop.organizationId, { isDeleted: true });
      return {
        organizationId: shop.organizationId,
        shopId,
        deletedShopId,
        deletedOrganizationId: deletedOrganizationShop.organizationId,
      };
    });

    const result = await t.query(getOrganizationExportRef, { organizationId: ids.organizationId, asOf: AS_OF });

    expect(result).toMatchObject({
      organization: { organizationId: ids.organizationId, shopCount: 1 },
      shops: [{ shopId: ids.shopId, name: "組織の店舗" }],
      shopsTruncated: false,
    });
    await expect(
      t.query(getOrganizationExportRef, { organizationId: ids.deletedOrganizationId, asOf: AS_OF }),
    ).resolves.toBeNull();
  });
});

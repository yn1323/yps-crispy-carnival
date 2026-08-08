import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";

async function setupConfirmedShiftView(t: TestConvex<typeof schema>, accessKind: "submit" | "view" = "view") {
  return await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "確定シフト閲覧店舗");
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "閲覧スタッフ",
      email: "viewer@example.com",
      isDeleted: false,
    });
    const excludedStaffId = await ctx.db.insert("staffs", {
      shopId,
      name: "対象外スタッフ",
      email: "excluded@example.com",
      excludedFromShift: true,
      isDeleted: false,
    });
    const positionId = await ctx.db.insert("positions", {
      shopId,
      name: "ホール",
      color: "#3b82f6",
      sortOrder: 0,
      isDefault: true,
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-07-20",
      periodEnd: "2026-07-26",
      deadline: "2026-07-17",
      shopClosedDates: ["2026-07-23"],
      status: "confirmed",
      confirmedAt: Date.now(),
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "10:00", endTime: "21:30" },
    });
    await ctx.db.insert("shiftAssignments", {
      recruitmentId,
      staffId,
      date: "2026-07-20",
      startTime: "11:00",
      endTime: "13:00",
      positionId,
    });
    await ctx.db.insert("shiftAssignments", {
      recruitmentId,
      staffId,
      date: "2026-07-20",
      startTime: "13:00",
      endTime: "19:00",
      positionId,
    });
    const sessionToken = "confirmed-shift-view-session";
    await ctx.db.insert("sessions", {
      sessionToken,
      staffId,
      shopId,
      recruitmentId,
      accessKind,
      expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
    });
    return { shopId, staffId, excludedStaffId, positionId, recruitmentId, sessionToken };
  });
}

describe("shiftView/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  describe("getShiftViewData", () => {
    it("確定済み募集の閲覧DTOを返し、empty option付きセルのpresenceも保持する", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupConfirmedShiftView(t);

      const result = await t.query(api.shiftView.queries.getShiftViewData, {
        sessionToken: ids.sessionToken,
        accessKind: "view",
        recruitmentId: ids.recruitmentId,
      });

      expect(result).toEqual({
        shopName: "確定シフト閲覧店舗",
        periodLabel: "7/20(月)〜7/26(日)",
        periodStart: "2026-07-20",
        periodEnd: "2026-07-26",
        staffs: [{ _id: ids.staffId, name: "閲覧スタッフ" }],
        positions: [{ _id: ids.positionId, name: "ホール", color: "#3b82f6", isDefault: true }],
        assignments: [
          {
            staffId: ids.staffId,
            date: "2026-07-20",
            startTime: "11:00",
            endTime: "19:00",
            positionId: ids.positionId,
          },
        ],
        shopClosedDates: ["2026-07-23"],
        submissionPattern: { kind: "time", startTime: "10:00", endTime: "21:30" },
        timeRange: {
          start: 10,
          end: 22,
          unit: 30,
          editableStartMinutes: 600,
          editableEndMinutes: 1290,
        },
      });
      expect(result?.staffs.map((staff) => staff._id)).not.toContain(ids.excludedStaffId);

      await t.run(async (ctx) => {
        const firstAssignment = await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.recruitmentId))
          .filter((q) => q.eq(q.field("startTime"), "11:00"))
          .unique();
        if (!firstAssignment) throw new Error("empty option fixture assignment was not found");
        await ctx.db.patch(firstAssignment._id, { optionId: "" });
      });
      await expect(
        t.query(api.shiftView.queries.getShiftViewData, {
          sessionToken: ids.sessionToken,
          accessKind: "view",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toMatchObject({
        assignments: [
          {
            staffId: ids.staffId,
            startTime: "11:00",
            endTime: "13:00",
            optionId: "",
          },
          {
            staffId: ids.staffId,
            startTime: "13:00",
            endTime: "19:00",
          },
        ],
      });
    });

    it("割当が上限を超える場合は部分的な確定シフトを返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupConfirmedShiftView(t);
      await t.run(async (ctx) => {
        for (let index = 2; index <= SHIFT_ASSIGNMENT_LIMIT; index += 1) {
          await ctx.db.insert("shiftAssignments", {
            recruitmentId: ids.recruitmentId,
            staffId: ids.staffId,
            date: "2026-07-20",
            startTime: "11:00",
            endTime: "13:00",
            positionId: ids.positionId,
          });
        }
      });

      await expect(
        t.query(api.shiftView.queries.getShiftViewData, {
          sessionToken: ids.sessionToken,
          accessKind: "view",
          recruitmentId: ids.recruitmentId,
        }),
      ).rejects.toThrow("Shift assignment scope exceeds the supported limit");
    });

    it("スタッフ所属店舗と異なる店舗を指すsessionは無効として扱う", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupConfirmedShiftView(t);
      await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "別店舗");
        const session = await ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", ids.sessionToken))
          .first();
        if (!session) throw new Error("テスト用sessionが見つかりません");
        await ctx.db.patch(session._id, { shopId: otherShopId });
      });

      await expect(
        t.query(api.shiftView.queries.getShiftViewData, {
          sessionToken: ids.sessionToken,
          accessKind: "view",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
    });

    it("実体もcaller引数もsubmitのsessionでは確定シフトを閲覧できない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupConfirmedShiftView(t, "submit");

      await expect(
        t.query(api.shiftView.queries.getShiftViewData, {
          sessionToken: ids.sessionToken,
          accessKind: "submit",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
    });

    it("未確定の募集はview用sessionでも返さない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupConfirmedShiftView(t);
      await t.run(async (ctx) => await ctx.db.patch(ids.recruitmentId, { status: "open", confirmedAt: undefined }));

      await expect(
        t.query(api.shiftView.queries.getShiftViewData, {
          sessionToken: ids.sessionToken,
          accessKind: "view",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();
    });
  });
});

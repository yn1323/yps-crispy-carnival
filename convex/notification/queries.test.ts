import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notification/queries", () => {
  describe("getConfirmationEmailData", () => {
    it("同じ日の複数確定セグメントを1日の表示ラベルにまとめる", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-20",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });

        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "17:00",
          endTime: "22:00",
          positionId,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "14:00",
          positionId,
        });

        return recruitmentId;
      });

      const result = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });

      expect(result?.staffEntries[0].shifts).toEqual([{ date: "1/20(火)", timeLabel: "10:00-14:00 / 17:00-22:00" }]);
    });

    it("確定通知データでは定休日を定休日として返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-21",
          deadline: "2026-01-17",
          shopClosedDates: ["2026-01-21"],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });

        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "14:00",
          positionId,
        });

        return recruitmentId;
      });

      const result = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });

      expect(result?.staffEntries[0].shifts).toEqual([
        { date: "1/20(火)", timeLabel: "10:00-14:00" },
        { date: "1/21(水)", timeLabel: "定休日" },
      ]);
    });
  });
});

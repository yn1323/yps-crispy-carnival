import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("email/mutations", () => {
  describe("createMagicLink", () => {
    it("24時間有効のマジックリンクが作成される", async () => {
      const t = convexTest(schema, modules);

      const { shopId, staffId, recruitmentId } = await t.run(async (ctx) => {
        const shopId = await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_owner",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        return { shopId, staffId, recruitmentId };
      });

      const result = await t.mutation(internal.email.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
      });

      expect(result.token).toBeDefined();
      expect(result.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      // DBのレコードを確認
      await t.run(async (ctx) => {
        const magicLink = await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", result.token))
          .first();
        if (!magicLink) throw new Error("magicLink not found");
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;
        const diff = magicLink.expiresAt - Date.now();
        expect(diff).toBeGreaterThan(twentyFourHoursMs - 60000);
        expect(diff).toBeLessThanOrEqual(twentyFourHoursMs);
      });
    });
  });
});

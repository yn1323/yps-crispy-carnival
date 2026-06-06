import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notification/mutations", () => {
  async function setupSubmitLinkTestData(t: TestConvex<typeof schema>) {
    return await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "提出店舗");
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-01-20",
        periodEnd: "2026-01-26",
        deadline: "2026-01-17",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "提出スタッフ",
        email: "submit@example.com",
        isDeleted: false,
      });
      return { shopId, staffId, recruitmentId };
    });
  }

  describe("createMagicLink", () => {
    it("24時間有効のマジックリンクが作成される", async () => {
      const t = convexTest(schema, modules);

      const { shopId, staffId, recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        return { shopId, staffId, recruitmentId };
      });

      const result = await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
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
        expect(magicLink.accessKind).toBe("view");
      });
    });

    it("指定した用途と期限を保存する", async () => {
      const t = convexTest(schema, modules);
      const expiresAt = Date.now() + 123456;

      const { shopId, staffId, recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "提出店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "提出スタッフ",
          email: "submit@example.com",
          isDeleted: false,
        });
        return { shopId, staffId, recruitmentId };
      });

      const result = await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt,
      });

      const magicLink = await t.run(async (ctx) =>
        ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", result.token))
          .first(),
      );
      expect(magicLink).toMatchObject({ accessKind: "submit", expiresAt });
    });
  });

  describe("getOrCreateSubmitMagicLink", () => {
    it("同一スタッフ・同一募集のsubmitリンクを再利用し、期限を更新する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentId } = await setupSubmitLinkTestData(t);

      const first = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 1_000,
      });
      const second = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 2_000,
      });

      expect(second.token).toBe(first.token);
      const links = await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ accessKind: "submit", expiresAt: 2_000 });
    });

    it("revoked済みのsubmitリンクは再利用しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentId } = await setupSubmitLinkTestData(t);

      const first = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 1_000,
      });
      await t.run(async (ctx) => {
        const link = await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", first.token))
          .first();
        if (!link) throw new Error("magicLink not found");
        await ctx.db.patch(link._id, { revokedAt: 1_500 });
      });

      const second = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 2_000,
      });

      expect(second.token).not.toBe(first.token);
      const links = await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
      expect(links).toHaveLength(2);
    });

    it("viewリンクは再利用対象にしない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentId } = await setupSubmitLinkTestData(t);
      await t.mutation(internal.notification.mutations.createMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: 1_000,
      });

      const submit = await t.mutation(internal.notification.mutations.getOrCreateSubmitMagicLink, {
        staffId,
        shopId,
        recruitmentId,
        expiresAt: 2_000,
      });

      const links = await t.run(async (ctx) => await ctx.db.query("magicLinks").collect());
      expect(links).toHaveLength(2);
      expect(links.find((link) => link.token === submit.token)?.accessKind).toBe("submit");
    });
  });
});

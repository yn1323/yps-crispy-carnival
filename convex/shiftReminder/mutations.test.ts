import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function setupTestData(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_manager",
      email: "manager@example.com",
      shopName: "テスト店舗",
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-15",
      deadline: "2026-04-25",
      shopClosedDates: [],
      status: "open",
      isDeleted: false,
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
    });
    return { shopId, recruitmentId };
  });
}

describe("shiftReminder/mutations", () => {
  describe("sendReminderEmails", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.shiftReminder.mutations.sendReminderEmails, {
          recruitmentId: "invalid" as Id<"recruitments">,
        }),
      ).rejects.toThrow();
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_other",
          email: "other@example.com",
          shopName: "他店舗",
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_other" })
          .mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId }),
      ).rejects.toThrow(ConvexError);
    });

    it("確定済み募集ではエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { status: "confirmed", confirmedAt: Date.now() });
      });

      await expect(
        t
          .withIdentity({ subject: "user_manager" })
          .mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId }),
      ).rejects.toThrow("募集中のシフトだけ、催促を送れます");
    });

    it("正常時に lastReminderSentAt を更新する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t
        .withIdentity({ subject: "user_manager" })
        .mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.lastReminderSentAt).toBeTypeOf("number");
    });

    it("既に送信済みでもクールダウンなしで送信できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);
      const previous = Date.now() - 1000;
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { lastReminderSentAt: previous });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftReminder.mutations.sendReminderEmails, {
        recruitmentId,
      });
      const second = await t.run(async (ctx) => ctx.db.get(recruitmentId));

      expect(second?.lastReminderSentAt).toBeTypeOf("number");
      expect(second?.lastReminderSentAt).toBeGreaterThanOrEqual(previous);
    });
  });
});

import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { modules, schema } from "../_test/setup.test-helper";

async function setupTestData(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const shopId = await ctx.db.insert("shops", {
      name: "テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "user_owner",
      isDeleted: false,
    });
    await ctx.db.insert("users", {
      clerkId: "user_owner",
      name: "オーナー",
      email: "owner@example.com",
      role: "manager",
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-15",
      deadline: "2026-04-25",
      status: "open",
      isDeleted: false,
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
        await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_other",
          isDeleted: false,
        });
        await ctx.db.insert("users", {
          clerkId: "user_other",
          name: "他人",
          email: "other@example.com",
          role: "manager",
          isDeleted: false,
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
          .withIdentity({ subject: "user_owner" })
          .mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId }),
      ).rejects.toThrow("募集中の状態でのみ催促できます");
    });

    it("正常時に lastReminderSentAt を更新する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t
        .withIdentity({ subject: "user_owner" })
        .mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.lastReminderSentAt).toBeTypeOf("number");
    });

    it("連続送信できる（クールダウンなし）", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);
      const asOwner = t.withIdentity({ subject: "user_owner" });

      await asOwner.mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId });
      const first = await t.run(async (ctx) => ctx.db.get(recruitmentId));

      await asOwner.mutation(api.shiftReminder.mutations.sendReminderEmails, { recruitmentId });
      const second = await t.run(async (ctx) => ctx.db.get(recruitmentId));

      expect(first?.lastReminderSentAt).toBeTypeOf("number");
      expect(second?.lastReminderSentAt).toBeTypeOf("number");
      expect(second?.lastReminderSentAt).toBeGreaterThanOrEqual(first?.lastReminderSentAt ?? 0);
    });
  });
});

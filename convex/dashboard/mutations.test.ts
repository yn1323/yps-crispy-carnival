import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("dashboard/mutations", () => {
  describe("dismissOnboarding", () => {
    it("未認証の場合は拒否する", async () => {
      const t = convexTest(schema, modules);

      await expect(t.mutation(api.dashboard.mutations.dismissOnboarding, {})).rejects.toThrowError("Unauthenticated");
    });

    it("ユーザー未登録の場合は副作用なく完了する", async () => {
      const t = convexTest(schema, modules);

      await expect(
        t.withIdentity({ subject: "unregistered_user" }).mutation(api.dashboard.mutations.dismissOnboarding, {}),
      ).resolves.toBeNull();

      const users = await t.run(async (ctx) => ctx.db.query("users").collect());
      expect(users).toEqual([]);
    });

    it("本人だけをdismiss済みにし、再実行しても他ユーザーへ影響しない", async () => {
      vi.useFakeTimers();
      try {
        const t = convexTest(schema, modules);
        const { currentUserId, otherUserId } = await t.run(async (ctx) => {
          const currentUserId = await seedUser(ctx, "current_user");
          const otherUserId = await seedUser(ctx, "other_user");
          await ctx.db.patch(otherUserId, { dashboardOnboardingDismissedAt: 123 });
          return { currentUserId, otherUserId };
        });

        const firstDismissedAt = new Date("2026-07-13T10:00:00+09:00").getTime();
        vi.setSystemTime(firstDismissedAt);
        await t.withIdentity({ subject: "current_user" }).mutation(api.dashboard.mutations.dismissOnboarding, {});

        const secondDismissedAt = new Date("2026-07-13T10:05:00+09:00").getTime();
        vi.setSystemTime(secondDismissedAt);
        await t.withIdentity({ subject: "current_user" }).mutation(api.dashboard.mutations.dismissOnboarding, {});

        const result = await t.run(async (ctx) => ({
          currentUser: await ctx.db.get(currentUserId),
          otherUser: await ctx.db.get(otherUserId),
        }));
        expect(result.currentUser?.dashboardOnboardingDismissedAt).toBe(secondDismissedAt);
        expect(result.otherUser?.dashboardOnboardingDismissedAt).toBe(123);
      } finally {
        vi.useRealTimers();
      }
    });

    it("論理削除済みユーザーは更新しない", async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "deleted_user");
        await ctx.db.patch(userId, { isDeleted: true });
        return userId;
      });

      await expect(
        t.withIdentity({ subject: "deleted_user" }).mutation(api.dashboard.mutations.dismissOnboarding, {}),
      ).resolves.toBeNull();

      const user = await t.run(async (ctx) => ctx.db.get(userId));
      expect(user?.dashboardOnboardingDismissedAt).toBeUndefined();
    });
  });
});

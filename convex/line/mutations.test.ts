import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShop,
  seedShopMembership,
  seedStaffLineAccount,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { LINE_LINK_REDEEM_GLOBAL_LIMIT, LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT } from "../constants";

async function setupShop(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "mgr@example.com",
      shopName: "テスト店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    return { shopId, staffId };
  });
}

async function setupOrganizationShop(t: TestConvex<typeof schema>, subject: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, {
      subject,
      email: `${subject}@example.com`,
      shopName: "事業者店舗",
      plan: "pro",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId: seeded.shopId,
      organizationId: seeded.organizationId,
      name: "事業者店舗スタッフ",
      email: `${subject}-staff@example.com`,
      isDeleted: false,
    });
    return { ...seeded, staffId };
  });
}

async function seedLineLinkToken(
  t: TestConvex<typeof schema>,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    token?: string;
    expiresAt?: number;
    usedAt?: number;
  },
) {
  const token = args.token ?? "line-link-token";
  const tokenDocId = await t.run(async (ctx) => {
    const tokenDoc = {
      staffId: args.staffId,
      shopId: args.shopId,
      token,
      expiresAt: args.expiresAt ?? Date.now() + 72 * 60 * 60 * 1000,
      ...(args.usedAt === undefined ? {} : { usedAt: args.usedAt }),
    };
    return await ctx.db.insert("lineLinkTokens", tokenDoc);
  });
  return { token, tokenDocId };
}

describe("line/mutations", () => {
  describe("generateLinkToken", () => {
    it("未認証なら拒否", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await expect(t.mutation(api.line.mutations.generateLinkToken, { shopId, staffId })).rejects.toThrow();
    });

    it("認証済みシフト担当者は自店舗スタッフにトークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);

      const { token } = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.line.mutations.generateLinkToken, { shopId, staffId });
      expect(token).toMatch(/^[0-9a-f-]{36}$/);

      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.staffId).toBe(staffId);
      expect(link?.expiresAt).toBeGreaterThan(Date.now());
    });

    it("他店舗スタッフへのトークン発行は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.generateLinkToken, {
          shopId,
          staffId: otherStaffId,
        }),
      ).rejects.toThrow("Not found");
    });

    it("複数店舗マネージャーは shopId 指定でその店舗のスタッフにトークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { shopAId, shopBId, staffBId } = await t.run(async (ctx) => {
        const { userId, shopId: shopAId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "店舗A",
        });
        const shopBId = await seedShop(ctx, "店舗B");
        await seedShopMembership(ctx, { userId, shopId: shopBId });
        const staffBId = await ctx.db.insert("staffs", {
          shopId: shopBId,
          name: "B店スタッフ",
          email: "b@example.com",
          isDeleted: false,
        });
        return { shopAId, shopBId, staffBId };
      });

      // 店舗Aを明示した場合、店舗Bスタッフは店舗境界の外なので参照できない
      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.line.mutations.generateLinkToken, { shopId: shopAId, staffId: staffBId }),
      ).rejects.toThrow("Not found");

      const { token } = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.line.mutations.generateLinkToken, { shopId: shopBId, staffId: staffBId });
      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.staffId).toBe(staffBId);
      expect(link?.shopId).toBe(shopBId);
    });

    it("未所属の shopId 指定は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      const foreignShopId = await t.run(async (ctx) => await seedShop(ctx, "無関係店舗"));

      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.line.mutations.generateLinkToken, { staffId, shopId: foreignShopId }),
      ).rejects.toThrow("Not found");
    });
  });

  describe("createLinkTokenInternal", () => {
    it("LINE連携トークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);

      const { token } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });

      expect(token).toMatch(/^[0-9a-f-]{36}$/);
      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.staffId).toBe(staffId);
      expect(link?.shopId).toBe(shopId);
      expect(link?.expiresAt).toBeGreaterThan(Date.now());
    });

    it("managerとinternalの両発行入口で旧tokenを失効し、最新tokenだけを一度利用できる", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const manager = t.withIdentity({ subject: "user_mgr" });

      const first = await manager.mutation(api.line.mutations.generateLinkToken, { shopId, staffId });
      const second = await manager.mutation(api.line.mutations.generateLinkToken, { shopId, staffId });
      const afterManagerIssue = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect(),
      );
      expect(afterManagerIssue.find((token) => token.token === first.token)?.revokedAt).toEqual(expect.any(Number));
      expect(
        afterManagerIssue.filter((token) => !token.revokedAt && !token.usedAt && token.expiresAt >= Date.now()),
      ).toHaveLength(1);
      expect(afterManagerIssue.find((token) => token.token === second.token)?.revokedAt).toBeUndefined();

      const latest = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });
      const afterInternalIssue = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect(),
      );
      expect(afterInternalIssue.find((token) => token.token === second.token)?.revokedAt).toEqual(expect.any(Number));
      const activeUnused = afterInternalIssue.filter(
        (token) => !token.revokedAt && !token.usedAt && token.expiresAt >= Date.now(),
      );
      expect(activeUnused).toHaveLength(1);
      expect(activeUnused[0]?.token).toBe(latest.token);

      for (const revokedToken of [first.token, second.token]) {
        await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: revokedToken })).resolves.toEqual({
          status: "expired",
        });
      }
      const validation = await t.mutation(internal.line.mutations.validateLinkToken, { state: latest.token });
      expect(validation.status).toBe("ok");
      if (validation.status !== "ok") throw new Error("latest LINE token was not valid");
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId: validation.tokenDocId,
          lineUserId: "U_newest_only",
          lineFollowing: false,
        }),
      ).resolves.toEqual({ status: "ok" });
      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: latest.token })).resolves.toEqual({
        status: "expired",
      });
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId: validation.tokenDocId,
          lineUserId: "U_newest_only",
          lineFollowing: false,
        }),
      ).resolves.toEqual({ status: "expired" });
    });
  });

  describe("validateLinkToken", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("有効トークンは ok を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token, tokenDocId } = await seedLineLinkToken(t, { staffId, shopId });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.staffId).toBe(staffId);
      expect(result.shopId).toBe(shopId);
      expect(result.tokenDocId).toBe(tokenDocId);
    });

    it("使用済みトークンは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, { staffId, shopId, usedAt: Date.now() - 1000 });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });

      expect(result.status).toBe("expired");
    });

    it("期限切れトークンは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      await seedLineLinkToken(t, { staffId, shopId, token: "expired-token", expiresAt: Date.now() - 1000 });

      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: "expired-token" });
      expect(r.status).toBe("expired");
    });

    it("存在しない state は expired", async () => {
      const t = convexTest(schema, modules);
      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: "nonexistent" });
      expect(r.status).toBe("expired");
    });

    it("同一stateが異なるスタッフに重複している場合は対象情報を返さず連携を変更しない", async () => {
      const t = convexTest(schema, modules);
      const first = await setupShop(t);
      const second = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "重複token対象店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "重複token対象スタッフ",
          email: "duplicate-line@example.com",
          isDeleted: false,
        });
        return { shopId, staffId };
      });
      const token = "duplicate-target-line-token";
      await seedLineLinkToken(t, { ...first, token });
      await seedLineLinkToken(t, { ...second, token });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });

      const state = await t.run(async (ctx) => ({
        links: await ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .collect(),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.links).toHaveLength(2);
      expect(new Set(state.links.map((link) => link.staffId))).toEqual(new Set([first.staffId, second.staffId]));
      expect(state.links.every((link) => link.usedAt === undefined)).toBe(true);
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("tokenの店舗とスタッフ所属店舗が一致しない場合は expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      const otherShopId = await t.run(async (ctx) => seedShop(ctx, "別店舗"));
      const { token } = await seedLineLinkToken(t, {
        staffId,
        shopId: otherShopId,
        token: "cross-shop-line-token",
      });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });

      expect(result).toEqual({ status: "expired" });
    });

    it("削除済みスタッフのtokenは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "deleted-staff-line-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(staffId, { isDeleted: true }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });
    });

    it("削除済み店舗のtokenは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "deleted-shop-line-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { isDeleted: true }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });
    });

    it("発行後に事業者店舗がplanSuspendedになったtokenは expired を返し副作用を起こさない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupOrganizationShop(t, "line_validate_suspended");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "suspended-shop-line-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { operatingStatus: "planSuspended" }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("発行後に事業者がrestrictedになったtokenは expired を返し副作用を起こさない", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, personId, staffId, shopId } = await setupOrganizationShop(t, "line_validate_restricted");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "restricted-organization-line-token",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        const now = Date.now();
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [personId],
            previousActiveShopIds: [shopId],
            restrictedAt: now,
          },
          version: billingState.version + 1,
          updatedAt: now,
        });
      });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("存在する同じstateを6回検証するとtoken単位の二次rate limitが働く", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, { staffId, shopId, token: "same-valid-state-token" });
      const results = [];
      for (let index = 0; index < 6; index++) {
        results.push(await t.mutation(internal.line.mutations.validateLinkToken, { state: token }));
      }

      expect(results.slice(0, 5).every((result) => result.status === "ok")).toBe(true);
      expect(results[5]).toEqual({ status: "rate_limited" });
    });

    it("異なる無効state prefixは固定global budgetを共有するが、有効stateを停止させない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, { staffId, shopId, token: "recovery-valid-state-token" });
      const before = await t.run(async (ctx) => ({
        tokens: await ctx.db.query("lineLinkTokens").collect(),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));

      for (let attempt = 0; attempt < LINE_LINK_REDEEM_GLOBAL_LIMIT; attempt += 1) {
        const state = `${String(attempt).padStart(8, "0")}-invalid-state`;
        await expect(t.mutation(internal.line.mutations.validateLinkToken, { state })).resolves.toEqual({
          status: "expired",
        });
      }
      await expect(
        t.mutation(internal.line.mutations.validateLinkToken, { state: "overflow-invalid-state" }),
      ).resolves.toEqual({ status: "rate_limited" });

      const after = await t.run(async (ctx) => ({
        tokens: await ctx.db.query("lineLinkTokens").collect(),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        globalRows: await ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "lineLinkRedeemGlobal"))
          .collect(),
        tokenRows: await ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "lineLinkRedeem"))
          .collect(),
      }));
      expect({
        tokens: after.tokens,
        accounts: after.accounts,
        outbox: after.outbox,
        scheduled: after.scheduled,
      }).toEqual(before);
      expect(after.globalRows).toHaveLength(1);
      expect(after.globalRows[0]?.key).toBeUndefined();
      expect(after.tokenRows).toEqual([]);

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
        staffId,
      });
      const tokenRows = await t.run(async (ctx) =>
        ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "lineLinkRedeem"))
          .collect(),
      );
      expect(tokenRows).toHaveLength(1);
    });
  });

  describe("finalizeLinking", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("有効な tokenDocId なら staffLineAccounts にLINE連携情報が保存され usedAt が記録される", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token, tokenDocId } = await seedLineLinkToken(t, { staffId, shopId });

      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId,
        tokenDocId,
        lineUserId: "U_abcdef",
        lineFollowing: true,
      });

      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(account?.lineUserId).toBe("U_abcdef");
      expect(account?.following).toBe(true);
      expect(account?.linkedAt).toBeGreaterThan(0);

      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.usedAt).toBeGreaterThan(0);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "legal/actions:sendStaffConsentLine" && job.args[0]?.staffId === staffId),
      ).toBe(true);
    });

    it("事業者移行中で課金状態が未作成でもactive店舗ならvalidateと連携を継続できる", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, staffId, shopId } = await setupOrganizationShop(t, "line_widen_without_billing");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "widen-without-billing-line-token",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        await ctx.db.delete(billingState._id);
      });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
      });
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_widen_without_billing",
          lineFollowing: false,
        }),
      ).resolves.toEqual({ status: "ok" });

      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .unique(),
      );
      expect(account?.lineUserId).toBe("U_widen_without_billing");
    });

    it("使用済み tokenDocId は expired を返し、スタッフを上書きしない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "used-line-link-token",
        usedAt: Date.now() - 1000,
      });
      await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, { staffId, shopId, lineUserId: "U_first", following: true });
      });

      const retry = await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId,
        tokenDocId,
        lineUserId: "U_second",
        lineFollowing: true,
      });

      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(retry.status).toBe("expired");
      expect(account?.lineUserId).toBe("U_first");
    });

    it("tokenの店舗とスタッフ所属店舗が一致しない場合は連携しない", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      const otherShopId = await t.run(async (ctx) => seedShop(ctx, "別店舗"));
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId: otherShopId,
        token: "cross-shop-finalize-token",
      });

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_cross_shop",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });
      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query("staffLineAccounts")
            .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
            .first(),
        ),
      ).resolves.toBeNull();
    });

    it("token検証後に店舗が削除された場合は連携しない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "deleted-shop-finalize-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { isDeleted: true }));

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_deleted_shop",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });
      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query("staffLineAccounts")
            .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
            .first(),
        ),
      ).resolves.toBeNull();
    });

    it("token検証後に事業者店舗がplanSuspendedになった場合は連携もscheduleも行わない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupOrganizationShop(t, "line_finalize_suspended");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "suspended-shop-finalize-token",
      });
      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { operatingStatus: "planSuspended" }));

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_suspended_shop",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("token検証後に事業者がrestrictedになった場合は連携もscheduleも行わない", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, personId, staffId, shopId } = await setupOrganizationShop(t, "line_finalize_restricted");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "restricted-organization-finalize-token",
      });
      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        const now = Date.now();
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [personId],
            previousActiveShopIds: [shopId],
            restrictedAt: now,
          },
          version: billingState.version + 1,
          updatedAt: now,
        });
      });

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_restricted_organization",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("既に他スタッフに紐づく lineUserId は奪う", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const otherStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "別人",
          email: "other@example.com",
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, { staffId: otherStaffId, shopId, lineUserId: "U_dup", following: true });
        return otherStaffId;
      });
      const { tokenDocId } = await seedLineLinkToken(t, { staffId, shopId, token: "relink-token" });

      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId,
        tokenDocId,
        lineUserId: "U_dup",
        lineFollowing: true,
      });

      const accounts = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_dup").eq("isDeleted", false))
          .collect(),
      );
      expect(accounts).toHaveLength(1);
      expect(accounts[0].staffId).toBe(staffId);
      const oldManager = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", otherStaffId))
          .first(),
      );
      expect(oldManager?.isDeleted).toBe(true);
    });

    it("別店舗で同じ lineUserId を連携しても、既存店舗のアカウントは残る（多店舗連携）", async () => {
      const t = convexTest(schema, modules);
      const { shopId: shopAId, staffId: staffAId } = await setupShop(t);
      // 同一人物が店舗Aで既にLINE連携済み
      await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, { staffId: staffAId, shopId: shopAId, lineUserId: "U_multi", following: true });
      });
      // 店舗Bの別 staff レコード（同一人物）
      const { shopBId, staffBId } = await t.run(async (ctx) => {
        const shopBId = await seedShop(ctx, "店舗B");
        const staffBId = await ctx.db.insert("staffs", {
          shopId: shopBId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        return { shopBId, staffBId };
      });
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId: staffBId,
        shopId: shopBId,
        token: "shopB-token",
      });

      const result = await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: staffBId,
        tokenDocId,
        lineUserId: "U_multi",
        lineFollowing: true,
      });
      expect(result.status).toBe("ok");

      const accounts = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_multi").eq("isDeleted", false))
          .collect(),
      );
      expect(accounts).toHaveLength(2);
      expect(accounts.map((a) => a.staffId).sort()).toEqual([staffAId, staffBId].sort());
    });
  });

  describe("dispatchWebhookEvents", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("follow イベントで lineFollowing が true になる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        if (!staff) throw new Error("missing staff");
        await seedStaffLineAccount(ctx, { staffId, shopId: staff.shopId, lineUserId: "U_abc", following: false });
      });
      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_abc", webhookEventId: "follow-U_abc", timestamp: 100 }],
      });
      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(account?.following).toBe(true);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "legal/actions:sendStaffConsentLine" && job.args[0]?.staffId === staffId),
      ).toBe(true);
    });

    it("unfollow イベントで lineFollowing が false になる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        if (!staff) throw new Error("missing staff");
        await seedStaffLineAccount(ctx, { staffId, shopId: staff.shopId, lineUserId: "U_abc", following: true });
      });
      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "unfollow", userId: "U_abc", webhookEventId: "unfollow-U_abc", timestamp: 200 }],
      });
      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(account?.following).toBe(false);
    });

    it("同じ lineUserId が複数店舗に紐づく場合、全アカウントの following を更新する", async () => {
      const t = convexTest(schema, modules);
      const { shopId: shopAId, staffId: staffAId } = await setupShop(t);
      const { staffBId } = await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, {
          staffId: staffAId,
          shopId: shopAId,
          lineUserId: "U_multi",
          following: false,
        });
        const shopBId = await seedShop(ctx, "店舗B");
        const staffBId = await ctx.db.insert("staffs", {
          shopId: shopBId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, {
          staffId: staffBId,
          shopId: shopBId,
          lineUserId: "U_multi",
          following: false,
        });
        return { staffBId };
      });

      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_multi", webhookEventId: "follow-U_multi", timestamp: 300 }],
      });

      const accounts = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_multi").eq("isDeleted", false))
          .collect(),
      );
      expect(accounts).toHaveLength(2);
      expect(accounts.every((a) => a.following)).toBe(true);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      for (const staffId of [staffAId, staffBId]) {
        expect(
          scheduled.some(
            (job) => job.name === "legal/actions:sendStaffConsentLine" && job.args[0]?.staffId === staffId,
          ),
        ).toBe(true);
      }
    });

    it("message イベントの replyToken が返る", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const r = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "message", replyToken: "reply-1", webhookEventId: "message-1", timestamp: Date.now() }],
      });
      expect(r.replyTokens).toEqual(["reply-1"]);
    });

    it("message予算を使い切っても別userのfollow状態を破棄しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, {
          staffId,
          shopId,
          lineUserId: "U_state_after_message_flood",
          following: false,
        });
      });

      for (let index = 0; index < LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT; index += 1) {
        const result = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
          events: [
            {
              type: "message",
              replyToken: `reply-${index}`,
              webhookEventId: `message-flood-${index}`,
              timestamp: Date.now(),
            },
          ],
        });
        expect(result.replyTokens).toEqual([`reply-${index}`]);
      }
      await expect(
        t.mutation(internal.line.mutations.dispatchWebhookEvents, {
          events: [
            {
              type: "message",
              replyToken: "reply-over-limit",
              webhookEventId: "message-flood-over-limit",
              timestamp: Date.now(),
            },
          ],
        }),
      ).resolves.toEqual({ replyTokens: [] });

      await expect(
        t.mutation(internal.line.mutations.dispatchWebhookEvents, {
          events: [
            {
              type: "follow",
              userId: "U_state_after_message_flood",
              webhookEventId: "follow-after-message-flood",
              timestamp: Date.now(),
            },
          ],
        }),
      ).resolves.toEqual({ replyTokens: [] });
      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .unique(),
      );
      expect(account?.following).toBe(true);
      expect(account?.lastWebhookEventId).toBe("follow-after-message-flood");
    });

    it("未知のスタッフ userId は黙ってスキップ", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const r = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_unknown", webhookEventId: "follow-unknown", timestamp: 500 }],
      });
      expect(r.replyTokens).toEqual([]);
    });
  });

  describe("upsertQuotaStatus", () => {
    it("既存レコードがある場合は replace で1件だけ保たれる", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("lineQuotaStatus", {
          checkedAt: Date.now() - 1000,
          totalQuota: 200,
          consumed: 50,
          remaining: 150,
          status: "normal",
          plan: "communication",
        });
      });

      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 200,
        consumed: 250,
        plan: "communication",
      });
      const all = await t.run(async (ctx) => ctx.db.query("lineQuotaStatus").collect());
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe("exceeded");
      expect(all[0].remaining).toBe(0);
    });

    it("remaining > 0 なら normal", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 5000,
        consumed: 1000,
        plan: "light",
      });
      const status = await t.run(async (ctx) => ctx.db.query("lineQuotaStatus").first());
      expect(status?.status).toBe("normal");
      expect(status?.remaining).toBe(4000);
    });

    it("status を指定した場合は remaining 0 でも normal にできる", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 0,
        consumed: 0,
        status: "normal",
        plan: "communication",
      });
      const status = await t.run(async (ctx) => ctx.db.query("lineQuotaStatus").first());
      expect(status?.status).toBe("normal");
      expect(status?.remaining).toBe(0);
    });
  });

  describe("sendInvite (個別)", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("自店舗スタッフへの送信が成功する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { shopId, staffId }),
      ).resolves.not.toThrow();
    });

    it("同じスタッフへの短時間連打では送信予約を増やさない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      const asManager = t.withIdentity({ subject: "user_mgr" });

      await asManager.mutation(api.line.mutations.sendInvite, { shopId, staffId });
      await asManager.mutation(api.line.mutations.sendInvite, { shopId, staffId });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(1);
    });

    it("1店舗で31人へ連続してLINE招待を予約できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      const staffIds = await t.run(async (ctx) => {
        const ids: Id<"staffs">[] = [];
        for (let i = 0; i < 31; i++) {
          ids.push(
            await ctx.db.insert("staffs", {
              shopId,
              name: `スタッフ${i + 1}`,
              email: `staff-${i + 1}@example.com`,
              isDeleted: false,
            }),
          );
        }
        return ids;
      });
      const asManager = t.withIdentity({ subject: "user_mgr" });

      for (const staffId of staffIds) {
        await expect(asManager.mutation(api.line.mutations.sendInvite, { shopId, staffId })).resolves.not.toThrow();
      }

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(31);
    });

    it("他店舗スタッフへの送信は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const sid = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: sid,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });
      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.line.mutations.sendInvite, { shopId, staffId: otherStaffId }),
      ).rejects.toThrow("Not found");
    });

    it("メールアドレス未登録なら拒否", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { email: "" });
      });
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { shopId, staffId }),
      ).rejects.toThrow("メールアドレスが未登録");
    });
  });
});

import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

async function setupShop(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: "user_mgr",
      name: "管理者",
      email: "mgr@example.com",
      role: "manager",
      isDeleted: false,
    });
    const shopId = await ctx.db.insert("shops", {
      name: "テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "user_mgr",
      isDeleted: false,
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

describe("line/mutations", () => {
  describe("generateLinkToken", () => {
    it("未認証なら拒否", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await expect(t.mutation(api.line.mutations.generateLinkToken, { staffId })).rejects.toThrow();
    });

    it("認証済み店長は自店舗スタッフにトークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);

      const { token } = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.line.mutations.generateLinkToken, { staffId });
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
      await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "other_owner",
          isDeleted: false,
        });
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.generateLinkToken, {
          staffId: otherStaffId,
        }),
      ).rejects.toThrow("Not found");
    });
  });

  describe("redeemLineToken / finalizeLinking", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("有効トークンは ok を返し、finalize で staffs に lineUserId が保存され usedAt が記録される", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);

      const { token } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;

      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: result.staffId,
        tokenDocId: result.tokenDocId,
        lineUserId: "U_abcdef",
        lineFollowing: true,
      });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.lineUserId).toBe("U_abcdef");
      expect(staff?.lineFollowing).toBe(true);
      expect(staff?.lineLinkedAt).toBeGreaterThan(0);

      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.usedAt).toBeGreaterThan(0);
    });

    it("finalize の再実行は expired を返し、スタッフを上書きしない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });
      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      if (result.status !== "ok") throw new Error("expected ok");

      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: result.staffId,
        tokenDocId: result.tokenDocId,
        lineUserId: "U_first",
        lineFollowing: true,
      });
      const retry = await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: result.staffId,
        tokenDocId: result.tokenDocId,
        lineUserId: "U_second",
        lineFollowing: true,
      });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(retry.status).toBe("expired");
      expect(staff?.lineUserId).toBe("U_first");
    });

    it("使用済みトークンは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });
      const r1 = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      if (r1.status !== "ok") throw new Error("expected ok");
      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: r1.staffId,
        tokenDocId: r1.tokenDocId,
        lineUserId: "U_abcdef",
        lineFollowing: true,
      });
      const r2 = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      expect(r2.status).toBe("expired");
    });

    it("期限切れトークンは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      await t.run(async (ctx) => {
        await ctx.db.insert("lineLinkTokens", {
          staffId,
          shopId,
          token: "expired-token",
          expiresAt: Date.now() - 1000,
        });
      });
      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: "expired-token" });
      expect(r.status).toBe("expired");
    });

    it("存在しない state は expired", async () => {
      const t = convexTest(schema, modules);
      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: "nonexistent" });
      expect(r.status).toBe("expired");
    });

    it("既に他スタッフに紐づく lineUserId は奪われる（再連携シナリオ）", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) =>
        ctx.db.insert("staffs", {
          shopId,
          name: "別人",
          email: "other@example.com",
          isDeleted: false,
          lineUserId: "U_dup",
          lineFollowing: true,
          lineLinkedAt: Date.now(),
        }),
      );

      const { token } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });
      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      if (r.status !== "ok") throw new Error("expected ok");
      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: r.staffId,
        tokenDocId: r.tokenDocId,
        lineUserId: "U_dup",
        lineFollowing: true,
      });

      const newOwner = await t.run(async (ctx) => ctx.db.get(staffId));
      const oldOwner = await t.run(async (ctx) => ctx.db.get(otherStaffId));
      expect(newOwner?.lineUserId).toBe("U_dup");
      expect(oldOwner?.lineUserId).toBeUndefined();
      expect(oldOwner?.lineFollowing).toBe(false);
    });
  });

  describe("dispatchWebhookEvents", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("follow イベントで lineFollowing が true になる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { lineUserId: "U_abc", lineFollowing: false });
      });
      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_abc" }],
      });
      const s = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(s?.lineFollowing).toBe(true);
    });

    it("unfollow イベントで lineFollowing が false になる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { lineUserId: "U_abc", lineFollowing: true });
      });
      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "unfollow", userId: "U_abc" }],
      });
      const s = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(s?.lineFollowing).toBe(false);
    });

    it("message イベントの replyToken が返る", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const r = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "message", replyToken: "reply-1" }],
      });
      expect(r.replyTokens).toEqual(["reply-1"]);
    });

    it("未知のスタッフ userId は黙ってスキップ", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const r = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_unknown" }],
      });
      expect(r.replyTokens).toEqual([]);
    });
  });

  describe("upsertQuotaStatus", () => {
    it("初回は insert、2回目は replace で1件だけ保たれる", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 200,
        consumed: 50,
        plan: "communication",
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
      const { staffId } = await setupShop(t);
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { staffId }),
      ).resolves.not.toThrow();
    });

    it("他店舗スタッフへの送信は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const sid = await ctx.db.insert("shops", {
          name: "他店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "other_owner",
          isDeleted: false,
        });
        return await ctx.db.insert("staffs", {
          shopId: sid,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { staffId: otherStaffId }),
      ).rejects.toThrow("Not found");
    });

    it("メールアドレス未登録なら拒否", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { email: "" });
      });
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { staffId }),
      ).rejects.toThrow("メールアドレスが未登録");
    });
  });

  describe("sendInviteBulk", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未連携スタッフだけが対象になる", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      await t.run(async (ctx) => {
        // 連携済み（friend OK）
        await ctx.db.insert("staffs", {
          shopId,
          name: "連携済み",
          email: "ok@example.com",
          isDeleted: false,
          lineUserId: "U_a",
          lineFollowing: true,
        });
        // 連携済みだが友達解除（対象になる）
        await ctx.db.insert("staffs", {
          shopId,
          name: "解除済み",
          email: "unfollow@example.com",
          isDeleted: false,
          lineUserId: "U_b",
          lineFollowing: false,
        });
        // メール未登録（対象外）
        await ctx.db.insert("staffs", {
          shopId,
          name: "メールなし",
          email: "",
          isDeleted: false,
        });
      });

      const r = await t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInviteBulk, {});
      // setupShop の suzuki(未連携・email有) + 解除済み = 2件
      expect(r.sentCount).toBe(2);
    });
  });
});

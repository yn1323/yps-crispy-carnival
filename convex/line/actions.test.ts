import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function seedRedeemableToken(t: TestConvex<typeof schema>, token: string) {
  return await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: `manager_${token}`,
      email: `${token}@example.com`,
      shopName: "LINE連携店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "LINE連携スタッフ",
      email: "line-staff@example.com",
      isDeleted: false,
    });
    const tokenDocId = await ctx.db.insert("lineLinkTokens", {
      staffId,
      shopId,
      token,
      expiresAt: Date.now() + 72 * 60 * 60 * 1000,
    });
    return { shopId, staffId, tokenDocId };
  });
}

function mockLineOAuth(friendFlag: boolean) {
  const fetchMock = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/oauth2/v2.1/token")) {
      return new Response(JSON.stringify({ access_token: "line-access-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/v2/profile")) {
      return new Response(JSON.stringify({ userId: "U_redeemed", displayName: "連携ユーザー" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/friendship/v1/status")) {
      return new Response(JSON.stringify({ friendFlag }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`想定外のLINE API呼び出し: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("line/actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"));
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "line-login-channel");
    vi.stubEnv("LINE_LOGIN_CHANNEL_SECRET", "line-login-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("redeemLineToken", () => {
    it("無効なstateでは外部APIを呼ばずexpiredを返す", async () => {
      const t = convexTest(schema, modules);
      const fetchMock = mockLineOAuth(true);

      const result = await t.action(api.line.actions.redeemLineToken, {
        state: "missing-line-token",
        code: "authorization-code",
      });

      expect(result).toEqual({ status: "expired" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("follow済みならOAuth完了後に連携を保存し、同じstateの再利用を拒否する", async () => {
      const t = convexTest(schema, modules);
      const { staffId, tokenDocId } = await seedRedeemableToken(t, "redeem-follow-token");
      const fetchMock = mockLineOAuth(true);

      const first = await t.action(api.line.actions.redeemLineToken, {
        state: "redeem-follow-token",
        code: "authorization-code",
      });
      const second = await t.action(api.line.actions.redeemLineToken, {
        state: "redeem-follow-token",
        code: "reused-authorization-code",
      });

      expect(first).toEqual({ status: "ok" });
      expect(second).toEqual({ status: "expired" });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const state = await t.run(async (ctx) => ({
        account: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
        token: await ctx.db.get(tokenDocId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(state.account).toMatchObject({ lineUserId: "U_redeemed", following: true, isDeleted: false });
      expect(state.token?.usedAt).toEqual(expect.any(Number));
      expect(state.scheduled.map((job) => job.name).sort()).toEqual(
        [
          "legal/actions:sendStaffConsentLine",
          "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        ].sort(),
      );
    });

    it("未followならneeds_followを返し、通知actionを予約しない", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await seedRedeemableToken(t, "redeem-needs-follow-token");
      mockLineOAuth(false);

      const result = await t.action(api.line.actions.redeemLineToken, {
        state: "redeem-needs-follow-token",
        code: "authorization-code",
      });

      expect(result).toEqual({ status: "needs_follow" });
      const state = await t.run(async (ctx) => ({
        account: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.account).toMatchObject({ lineUserId: "U_redeemed", following: false, isDeleted: false });
      expect(state.scheduled).toEqual([]);
    });
  });
});

import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { LINE_LINK_REDEEM_GLOBAL_LIMIT } from "../constants";

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
    vi.restoreAllMocks();
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

    it("異なる無効stateでglobal上限に達してもproviderを呼ばず、window回復後は正常tokenを処理する", async () => {
      const t = convexTest(schema, modules);
      const { tokenDocId } = await seedRedeemableToken(t, "global-limit-recovery-token");
      const fetchMock = mockLineOAuth(false);
      const before = await t.run(async (ctx) => ({
        token: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));

      for (let attempt = 0; attempt < LINE_LINK_REDEEM_GLOBAL_LIMIT; attempt += 1) {
        await expect(
          t.action(api.line.actions.redeemLineToken, {
            state: `${String(attempt).padStart(8, "0")}-invalid-action-state`,
            code: "unused-authorization-code",
          }),
        ).resolves.toEqual({ status: "expired" });
      }
      await expect(
        t.action(api.line.actions.redeemLineToken, {
          state: "overflow-invalid-action-state",
          code: "unused-authorization-code",
        }),
      ).resolves.toEqual({ status: "rate_limited" });
      expect(fetchMock).not.toHaveBeenCalled();
      const afterRejected = await t.run(async (ctx) => ({
        token: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(afterRejected).toEqual(before);

      vi.setSystemTime(new Date(Date.now() + 60_000));
      await expect(
        t.action(api.line.actions.redeemLineToken, {
          state: "global-limit-recovery-token",
          code: "authorization-code",
        }),
      ).resolves.toEqual({ status: "needs_follow" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("LINE reply失敗のprovider bodyとreply tokenをconsoleへ出さない", async () => {
    const t = convexTest(schema, modules);
    const sentinelBody = 'staff+secret@example.com token=capability-secret {"provider":"declined"}';
    const replyToken = "reply-token-secret";
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response(sentinelBody, { status: 400 })),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(t.action(internal.line.actions.replyDefaultMessage, { replyToken })).resolves.toBeNull();

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("line_reply_failed");
    expect(logged).not.toContain(sentinelBody);
    expect(logged).not.toContain(replyToken);
  });

  it("LINE連携案内メールの件名を安全な通知履歴metadataとして保存する", async () => {
    const t = convexTest(schema, modules);
    const staffId = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "line_invite_manager",
        email: "line-invite-manager@notification.invalid",
        shopName: "LINE案内店舗",
      });
      return await ctx.db.insert("staffs", {
        shopId,
        name: "LINE案内スタッフ",
        email: "line-invite-staff@example.com",
        isDeleted: false,
      });
    });

    await t.action(internal.line.actions.sendInviteEmail, { staffId });

    const state = await t.run(async (ctx) => ({
      histories: await ctx.db.query("notificationHistory").collect(),
      jobs: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(state.jobs).toHaveLength(1);
    expect(state.histories).toHaveLength(1);
    if (state.jobs[0]?.payload.kind !== "email") throw new Error("LINE連携案内がメールpayloadではありません");
    expect(state.histories[0]).toMatchObject({
      outboxId: state.jobs[0]._id,
      staffId,
      notificationKind: "line.invite",
      displayTitle: state.jobs[0].payload.subject,
    });
  });
});

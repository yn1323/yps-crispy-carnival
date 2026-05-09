import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { managerMutation } from "../_lib/functions";
import { buildLineAuthorizeUrl } from "../_lib/lineClient";
import { rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";
import { LINE_LINK_TOKEN_TTL_MS } from "../constants";

/**
 * 店長UI: 指定スタッフに紐づくLINE連携トークンを発行
 * QRコード/連携用URLの土台。1スタッフにつき複数発行可（直近の有効トークンが使われる）
 *
 * 戻り値の `authorizeUrl` は LINE_LOGIN_CHANNEL_ID 未設定時は null（モック/開発時の安全弁）
 */
export const generateLinkToken = managerMutation({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.isDeleted || staff.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    const token = generateUUID();
    await ctx.db.insert("lineLinkTokens", {
      staffId: staff._id,
      shopId: staff.shopId,
      token,
      expiresAt: Date.now() + LINE_LINK_TOKEN_TTL_MS,
    });

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    const authorizeUrl = channelId
      ? buildLineAuthorizeUrl({
          channelId,
          redirectUri: `${APP_URL}/line/callback`,
          state: token,
        })
      : null;
    return { token, authorizeUrl };
  },
});

/**
 * 内部用: lineLinkTokens を発行する（actions / mutations から呼ぶ）
 * 連携依頼メールの送信時に使う
 */
export const createLinkTokenInternal = internalMutation({
  args: { staffId: v.id("staffs"), shopId: v.id("shops") },
  handler: async (ctx, { staffId, shopId }) => {
    const token = generateUUID();
    await ctx.db.insert("lineLinkTokens", {
      staffId,
      shopId,
      token,
      expiresAt: Date.now() + LINE_LINK_TOKEN_TTL_MS,
    });
    return { token };
  },
});

/**
 * LINE OAuth コールバックから呼ばれる: state（=トークン）の検証 + レートリミット
 * - レートリミット: state 先頭8文字
 * - トークン期限切れ・使用済みは "expired"
 * - 検証OK → action 側で code 交換 → finalizeLinking
 */
export const validateLinkToken = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const { ok } = await rateLimit(ctx, {
      name: "lineLinkRedeem",
      key: state.substring(0, 8),
    });
    if (!ok) return { status: "rate_limited" as const };

    const link = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_token", (q) => q.eq("token", state))
      .first();
    if (!link || link.expiresAt < Date.now() || link.usedAt) {
      return { status: "expired" as const };
    }
    return {
      status: "ok" as const,
      staffId: link.staffId,
      shopId: link.shopId,
      tokenDocId: link._id,
    };
  },
});

/**
 * 内部用: code 交換完了後に staffs と lineLinkTokens を更新
 */
export const finalizeLinking = internalMutation({
  args: {
    staffId: v.id("staffs"),
    tokenDocId: v.id("lineLinkTokens"),
    lineUserId: v.string(),
    lineFollowing: v.boolean(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.tokenDocId);
    if (!link || link.staffId !== args.staffId || link.expiresAt < Date.now() || link.usedAt) {
      return { status: "expired" as const };
    }
    const staff = await ctx.db.get(args.staffId);

    // 既に他スタッフに紐づいている lineUserId の場合は上書きせず置き換え
    // （同じLINEアカウントを別スタッフが連携し直したケース）
    const existing = await ctx.db
      .query("staffs")
      .withIndex("by_lineUserId", (q) => q.eq("lineUserId", args.lineUserId))
      .collect();
    for (const other of existing) {
      if (other._id !== args.staffId) {
        await ctx.db.patch(other._id, {
          lineUserId: undefined,
          lineFollowing: false,
          lineLinkedAt: undefined,
        });
      }
    }

    await ctx.db.patch(args.staffId, {
      lineUserId: args.lineUserId,
      lineLinkedAt: Date.now(),
      lineFollowing: args.lineFollowing,
    });
    await ctx.db.patch(args.tokenDocId, { usedAt: Date.now() });
    if (args.lineFollowing) {
      // LINE連携直後に同意依頼を送る。未followの場合は needs_follow 画面で友だち追加を促し、
      // follow Webhook 側で同じ案内を送る。
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
        staffId: args.staffId,
      });
    }
    if (args.lineFollowing && staff && !staff.lineFollowing && !staff.isDeleted) {
      // 初回followになったタイミングだけ、現在募集中の提出リンクをLINEにも流す。
      // 既にfollow済みの再連携では重複送信しない。
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
        staffId: args.staffId,
      });
    }
    return { status: "ok" as const };
  },
});

/**
 * Webhook: follow / unfollow 状態の更新
 */
export const markFollowing = internalMutation({
  args: { staffId: v.id("staffs"), following: v.boolean() },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    await ctx.db.patch(args.staffId, { lineFollowing: args.following });
    if (args.following && staff && !staff.lineFollowing && !staff.isDeleted) {
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
        staffId: args.staffId,
      });
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
        staffId: args.staffId,
      });
    }
  },
});

/**
 * Webhook: イベント一括処理
 * - グローバル rate limit
 * - follow / unfollow は staffs を更新
 * - message は replyToken を返却（呼び出し側 action が Reply API を叩く）
 */
export const dispatchWebhookEvents = internalMutation({
  args: {
    events: v.array(
      v.object({
        type: v.string(),
        userId: v.optional(v.string()),
        replyToken: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { events }) => {
    const { ok } = await rateLimit(ctx, { name: "lineWebhook", key: "global" });
    if (!ok) {
      return { replyTokens: [] as string[] };
    }

    // 同じ userId の follow/unfollow が連続した場合は最後の状態だけを反映する
    // （by_lineUserId クエリも 1 userId につき 1 回に集約）
    const followingByUserId = new Map<string, boolean>();
    const replyTokens: string[] = [];
    for (const ev of events) {
      if (ev.type === "follow" && ev.userId) followingByUserId.set(ev.userId, true);
      else if (ev.type === "unfollow" && ev.userId) followingByUserId.set(ev.userId, false);
      else if (ev.type === "message" && ev.replyToken) replyTokens.push(ev.replyToken);
    }

    for (const [userId, following] of followingByUserId) {
      const staff = await ctx.db
        .query("staffs")
        .withIndex("by_lineUserId", (q) => q.eq("lineUserId", userId))
        .first();
      if (staff && !staff.isDeleted) {
        const wasFollowing = Boolean(staff.lineFollowing);
        await ctx.db.patch(staff._id, { lineFollowing: following });
        if (following && !wasFollowing) {
          // ブロック解除などでfollow状態に戻った場合、未送達になっていた案内を補う。
          await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentLine, {
            staffId: staff._id,
          });
          await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
            staffId: staff._id,
          });
        }
      }
    }

    return { replyTokens };
  },
});

/**
 * Quota 状態を更新（cron から呼ばれる）。常に1件だけ保持
 */
export const upsertQuotaStatus = internalMutation({
  args: {
    totalQuota: v.number(),
    consumed: v.number(),
    status: v.optional(v.union(v.literal("normal"), v.literal("exceeded"))),
    plan: v.union(v.literal("communication"), v.literal("light"), v.literal("standard")),
  },
  handler: async (ctx, args) => {
    const remaining = Math.max(args.totalQuota - args.consumed, 0);
    const status = args.status ?? (remaining <= 0 ? ("exceeded" as const) : ("normal" as const));
    const existing = await ctx.db.query("lineQuotaStatus").first();
    const payload = {
      checkedAt: Date.now(),
      totalQuota: args.totalQuota,
      consumed: args.consumed,
      remaining,
      status,
      plan: args.plan,
    };
    if (existing) {
      await ctx.db.replace(existing._id, payload);
    } else {
      await ctx.db.insert("lineQuotaStatus", payload);
    }
  },
});

/**
 * 個別: 指定スタッフへ LINE 連携依頼メールを送る
 */
export const sendInvite = managerMutation({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.isDeleted || staff.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }
    if (!staff.email) {
      throw new ConvexError("メールアドレスが未登録です");
    }

    const { ok } = await rateLimit(ctx, {
      name: "lineInvite",
      key: ctx.shop._id,
    });
    if (!ok) {
      throw new ConvexError("送信が集中しています。しばらく待ってからお試しください");
    }

    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId: staff._id,
    });
  },
});

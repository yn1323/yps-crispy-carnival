"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import {
  buildLineAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchLineFriendshipStatus,
  fetchLineProfile,
  getMessageQuota,
  getMessageQuotaConsumption,
  pushTextMessage,
  replyTextMessage,
} from "../_lib/lineClient";
import { getResendClient, sendResendEmail } from "../_lib/resend";
import { buildLineInviteEmailHtml } from "../notification/templates";

function getLoginChannelId(): string {
  const v = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!v) throw new Error("LINE_LOGIN_CHANNEL_ID is not set");
  return v;
}
function getLoginChannelSecret(): string {
  const v = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!v) throw new Error("LINE_LOGIN_CHANNEL_SECRET is not set");
  return v;
}

const PLAN_BY_QUOTA: Record<number, "communication" | "light" | "standard"> = {
  200: "communication",
  5000: "light",
  30000: "standard",
};

/**
 * LINE OAuth コールバックから呼ばれる公開 action
 * - state を内部 mutation で検証 + rate limit
 * - code を access_token に交換、profile.userId 取得
 * - 内部 mutation で staffs と lineLinkTokens を更新
 *
 * 戻り値ステータス: "ok" / "expired" / "rate_limited"
 */
export const redeemLineToken = action({
  args: { state: v.string(), code: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "ok" } | { status: "needs_follow" } | { status: "expired" } | { status: "rate_limited" }> => {
    const validation = await ctx.runMutation(internal.line.mutations.validateLinkToken, {
      state: args.state,
    });
    if (validation.status !== "ok") return { status: validation.status };

    const { accessToken } = await exchangeAuthorizationCode({
      code: args.code,
      redirectUri: `${APP_URL}/line/callback`,
      channelId: getLoginChannelId(),
      channelSecret: getLoginChannelSecret(),
    });
    const [profile, friendship] = await Promise.all([
      fetchLineProfile(accessToken),
      fetchLineFriendshipStatus(accessToken),
    ]);

    const finalized = await ctx.runMutation(internal.line.mutations.finalizeLinking, {
      staffId: validation.staffId,
      tokenDocId: validation.tokenDocId,
      lineUserId: profile.userId,
      lineFollowing: friendship.friendFlag,
    });
    if (finalized.status !== "ok") return { status: finalized.status };
    return { status: friendship.friendFlag ? "ok" : "needs_follow" };
  },
});

/**
 * 通知振り分けロジック「LINE経路」分岐の実体
 * メール送信側ループから ctx.scheduler 経由で1スタッフ分ずつ呼ばれる
 */
export const sendPushNotification = internalAction({
  args: {
    lineUserId: v.string(),
    text: v.string(),
  },
  handler: async (_ctx, { lineUserId, text }) => {
    await pushTextMessage(lineUserId, text);
  },
});

/**
 * Webhook の message イベント定型応答
 */
export const replyDefaultMessage = internalAction({
  args: { replyToken: v.string() },
  handler: async (_ctx, { replyToken }) => {
    const text = [
      "シフトリの通知用アカウントです。",
      "シフトの確認や提出は、シフト作成担当者から届くメール／LINEのリンクからお願いします。",
    ].join("\n");
    try {
      await replyTextMessage(replyToken, text);
    } catch (e) {
      // reply 失敗で Webhook 全体を落とさない
      console.error("LINE reply failed", e);
    }
  },
});

/**
 * cron: 1日1回 Quota を取得して lineQuotaStatus を更新
 */
export const refreshQuotaStatus = internalAction({
  args: {},
  handler: async (ctx) => {
    const [quota, consumed] = await Promise.all([getMessageQuota(), getMessageQuotaConsumption()]);
    const totalQuota = quota.type === "limited" ? quota.value : consumed + 1;
    const plan = PLAN_BY_QUOTA[totalQuota] ?? "communication";
    const payload = {
      totalQuota,
      consumed,
      plan,
    };
    await ctx.runMutation(
      internal.line.mutations.upsertQuotaStatus,
      quota.type === "none" ? { ...payload, status: "normal" } : payload,
    );
  },
});

/**
 * 連携依頼メール（個別 / 一括 共通）を1件送る
 * `setup.setupShopAndManager` / `staff.addStaffs` / `sendInvite` mutation から scheduler 経由で呼ばれる
 */
export const sendInviteEmail = internalAction({
  args: {
    staffId: v.id("staffs"),
    context: v.optional(v.union(v.literal("default"), v.literal("registration_approved"))),
  },
  handler: async (ctx, { staffId, context }) => {
    const data = await ctx.runQuery(internal.line.queries.getInviteEmailData, { staffId });
    if (!data) return;
    const suppressDelivery = await ctx.runQuery(
      internal._lib.notificationDeliveryQueries.isNotificationDeliverySuppressedForShop,
      { shopId: data.shopId },
    );

    const { token } = await ctx.runMutation(internal.line.mutations.createLinkTokenInternal, {
      staffId: data.staffId,
      shopId: data.shopId,
    });
    const authorizeUrl = buildLineAuthorizeUrl({
      channelId: getLoginChannelId(),
      redirectUri: `${APP_URL}/line/callback`,
      state: token,
    });

    const resend = getResendClient({ suppressDelivery });
    await sendResendEmail(
      resend,
      {
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: data.staffEmail,
        subject: formatResendSubject(data.shopName, "シフト通知をLINEで受け取れます"),
        html: buildLineInviteEmailHtml({
          staffName: data.staffName,
          shopName: data.shopName,
          authorizeUrl,
          context,
        }),
      },
      "line.sendInviteEmail",
    );
  },
});

/**
 * シフト確定通知の LINE Push 送信（メール側ループから1スタッフずつ呼ばれる）
 * 受け取るのは事前生成されたメッセージ本文。メッセージ生成はメール側で集約。
 */
export const sendShiftConfirmationPush = internalAction({
  args: {
    lineUserId: v.string(),
    text: v.string(),
  },
  handler: async (_ctx, { lineUserId, text }) => {
    try {
      await pushTextMessage(lineUserId, text);
    } catch (e) {
      // 個別失敗で全体を止めない
      console.error("LINE push failed", e);
      throw new ConvexError("LINE push failed");
    }
  },
});

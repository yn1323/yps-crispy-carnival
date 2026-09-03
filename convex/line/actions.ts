"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { APP_URL, RESEND_FROM_EMAIL } from "../_lib/config";
import { formatResendFrom, formatResendSubject } from "../_lib/emailFormat";
import { observedAction as action, observedInternalAction as internalAction } from "../_lib/errorObservability";
import {
  buildLineAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchLineFriendshipStatus,
  fetchLineProfile,
  getMessageQuota,
  getMessageQuotaConsumption,
  replyTextMessage,
} from "../_lib/lineClient";
import { buildLineDefaultReplyText, buildLineInviteEmailHtml } from "../notification/templates";
import { emailPayload, enqueueEmail } from "../notificationOutbox/enqueue";
import { LINE_INVITE_NOTIFICATION_KIND } from "../notificationOutbox/historyKinds";
import { businessNotificationOriginArgs, businessNotificationOriginFrom } from "../notificationOutbox/origin";

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
  returns: v.object({
    status: v.union(v.literal("ok"), v.literal("needs_follow"), v.literal("expired"), v.literal("rate_limited")),
  }),
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
    const [profile, friendshipObservation] = await Promise.all([
      fetchLineProfile(accessToken),
      fetchLineFriendshipStatus(accessToken).then((friendship) => ({
        friendship,
        // providerへ問い合わせた結果が有効だった時点。mutation開始時刻で代用すると、
        // この後に受け取ったWebhookをstale OAuth結果で巻き戻し得る。
        observedAt: Date.now(),
      })),
    ]);

    const finalized = await ctx.runMutation(internal.line.mutations.finalizeLinking, {
      staffId: validation.staffId,
      tokenDocId: validation.tokenDocId,
      lineUserId: profile.userId,
      lineFollowing: friendshipObservation.friendship.friendFlag,
      lineFriendshipObservedAt: friendshipObservation.observedAt,
    });
    if (finalized.status !== "ok") return { status: finalized.status };
    if (!("following" in finalized)) throw new Error("LINE friendship result was unavailable");
    return { status: finalized.following ? "ok" : "needs_follow" };
  },
});

/**
 * Webhook の message イベント定型応答
 */
export const replyDefaultMessage = internalAction({
  args: { replyToken: v.string() },
  handler: async (_ctx, { replyToken }) => {
    try {
      await replyTextMessage(replyToken, buildLineDefaultReplyText());
    } catch {
      // reply 失敗で Webhook 全体を落とさない
      console.error("LINE reply failed", { errorCode: "line_reply_failed" });
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
    // TODO[narrow]: 全deploymentでverifyLineCommonScheduledCallersのoldLiveLineInviteCallersが0件になり、
    // 旧予約のdrain期間が終わった後に、人物IDと世代snapshotを同時にrequired化する。
    organizationPersonId: v.optional(v.id("organizationPeople")),
    lineLinkGenerationAtSchedule: v.optional(v.number()),
    context: v.optional(v.union(v.literal("default"), v.literal("registration_approved"))),
    ...businessNotificationOriginArgs,
  },
  handler: async (
    ctx,
    { staffId, organizationPersonId, lineLinkGenerationAtSchedule, context, organizationBillingVersionAtOrigin },
  ) => {
    if ((organizationPersonId === undefined) !== (lineLinkGenerationAtSchedule === undefined)) return;
    const notificationOrigin = businessNotificationOriginFrom({ organizationBillingVersionAtOrigin });
    const data = await ctx.runQuery(internal.line.queries.getInviteEmailData, { staffId });
    if (!data) return;
    const hasCanonicalSnapshot = organizationPersonId !== undefined;
    if (
      (hasCanonicalSnapshot &&
        (data.organizationPersonId !== organizationPersonId ||
          data.lineLinkGeneration !== lineLinkGenerationAtSchedule)) ||
      // Widen前callerは人物世代を固定できない。canonical scopeへ移行済みなら、連携後の解除で
      // unlinkedへ戻っていても古い予約から新capabilityを復活させない。
      (!hasCanonicalSnapshot && data.organizationPersonId !== undefined)
    ) {
      return;
    }
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
    const subject = formatResendSubject(data.shopName, "シフト通知をLINEで受け取れます");

    await enqueueEmail(ctx, {
      shopId: data.shopId,
      ...notificationOrigin,
      purpose: "business",
      staffId: data.staffId,
      history: {
        notificationKind: LINE_INVITE_NOTIFICATION_KIND,
        displayTitle: subject,
      },
      dedupeKey: `email:lineInvite:${data.staffId}`,
      payload: emailPayload({
        from: formatResendFrom(data.shopName, RESEND_FROM_EMAIL),
        to: data.staffEmail,
        subject,
        html: buildLineInviteEmailHtml({
          staffName: data.staffName,
          shopName: data.shopName,
          authorizeUrl,
          context,
        }),
        context: "line.sendInviteEmail",
        suppressDelivery,
      }),
    });
  },
});

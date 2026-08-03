import { defineRateLimits } from "convex-helpers/server/rateLimit";
import {
  CONTACT_TURNSTILE_GLOBAL_SHORT_LIMIT,
  DAY_MS,
  HOUR_MS,
  LINE_LINK_REDEEM_GLOBAL_LIMIT,
  LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT,
  MINUTE_MS,
  ORGANIZATION_CREATE_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT,
  STAFF_REGISTRATION_EMAIL_DAILY_LIMIT,
  STAFF_REGISTRATION_EMAIL_SHORT_LIMIT,
  STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT,
  STAFF_REGISTRATION_IP_DAILY_LIMIT,
  STAFF_REGISTRATION_IP_SHORT_LIMIT,
  STAFF_REGISTRATION_LINK_DAILY_LIMIT,
  STAFF_REGISTRATION_LINK_SHORT_LIMIT,
} from "../constants";

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // Cloudflare Access配下の内部BIからConvexへ入るservice requestの全体上限。
  analyticsDashboardService: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE_MS,
    capacity: 120,
  },

  // マジックリンクトークン検証: トークン先頭8文字をキーに
  // 5回/分 — ブルートフォース保険
  verifyToken: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE_MS,
    capacity: 5,
  },

  // リンク再発行リクエスト: email+recruitmentId をキーに
  // 3回/時 — メール爆撃防止（Resend課金対策）
  requestReissue: {
    kind: "token bucket",
    rate: 3,
    period: HOUR_MS,
    capacity: 3,
  },

  // リンク再発行リクエスト: email+recruitmentId をキーに
  // 1回/分 — 連打時の重複送信予約を抑止
  requestReissueShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // シフト希望提出: staffId をキーに
  // 5回/分 — 連打防止
  submitShiftRequests: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE_MS,
    capacity: 5,
  },

  // LINE 連携トークン交換: 無効stateだけを集約する固定bucket。
  // 異なるprefixで試行予算を分散させず、有効callbackは匿名攻撃者によるglobal枯渇の影響を受けない。
  lineLinkRedeemGlobal: {
    kind: "token bucket",
    rate: LINE_LINK_REDEEM_GLOBAL_LIMIT,
    period: MINUTE_MS,
    capacity: LINE_LINK_REDEEM_GLOBAL_LIMIT,
  },

  // LINE 連携トークン交換: 存在する有効stateだけを対象にする二次防御。
  lineLinkRedeem: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE_MS,
    capacity: 5,
  },

  // LINE message reply: グローバル
  // follow/unfollowをmessage集中で破棄しないよう、Reply API対象requestだけを制限する。
  lineWebhook: {
    kind: "token bucket",
    rate: LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT,
    period: MINUTE_MS,
    capacity: LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT,
  },

  // LINE 連携依頼メール（個別送信）: shopId+staffId をキーに
  // 1回/分 — 同じスタッフへのダブルクリック送信を抑止
  lineInviteShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // スタッフ個別の通知再送: actor+shopId+staffId+kind をキーにする短時間上限。
  staffNotificationResendActorShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // request IDを替え続けるactorから、同じスタッフへの長期間の通知爆撃を抑止する。
  staffNotificationResendActorDaily: {
    kind: "token bucket",
    rate: STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT,
    period: DAY_MS,
    capacity: STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT,
  },

  // actorを替えた回避を止める、organization（legacy店舗ではshop）単位の短時間上限。
  staffNotificationResendOrganizationShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // actorを替えた回避を止める、organization（legacy店舗ではshop）単位の日次上限。
  staffNotificationResendOrganizationDaily: {
    kind: "token bucket",
    rate: STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT,
    period: DAY_MS,
    capacity: STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT,
  },

  // 宛先を替えた分散操作も合算する、organization（legacy店舗ではshop）×通知種別の対象数上限。
  staffNotificationResendScopeTargetShort: {
    kind: "token bucket",
    rate: STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT,
    period: MINUTE_MS,
    capacity: STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT,
  },

  staffNotificationResendScopeTargetDaily: {
    kind: "token bucket",
    rate: STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_DAILY_LIMIT,
    period: DAY_MS,
    capacity: STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_DAILY_LIMIT,
  },

  // 通知失敗Inboxからの手動再送: shopId+failureId をキーに
  // 1回/分 — 同じ失敗の連打再送で配送ジョブを揺らさないための同期ガード
  notificationFailureRetryShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // 事業者管理者招待の発行: organizationId+normalized email 単位
  // 同じ宛先への並行操作はDBの一意性/OCCでも止め、これは連打とメール爆撃を抑える。
  organizationManagerInviteCreateShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  organizationManagerInviteCreateDaily: {
    kind: "token bucket",
    rate: 10,
    period: DAY_MS,
    capacity: 10,
  },

  // 再送は新しい招待を発行して旧招待を失効させるため、専用bucketで制限する。
  organizationManagerInviteResendShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // 再送は入口を問わずorganizationId+normalized email単位で合算する。
  // 10回/日 — 1分ごとの再送を続けるメール爆撃を抑止する。
  organizationManagerInviteResendDaily: {
    kind: "token bucket",
    rate: 10,
    period: DAY_MS,
    capacity: 10,
  },

  // 招待承認: 認証主体単位。攻撃者がtokenを変えても試行予算を分散させない。
  organizationManagerInviteAcceptActor: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE_MS,
    capacity: 5,
  },

  // 招待承認: token digestの先頭をkeyにする二次防御。
  organizationManagerInviteAccept: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE_MS,
    capacity: 5,
  },

  // 新しいグループの作成: userId 単位
  // 1回/分 — 連打と、requestIdを替えた二重作成を抑止する。
  organizationCreateShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // 新しいグループの作成: userId 単位
  // 同時に保持できる数は ORGANIZATION_SELF_CREATED_LIMIT が決めるため、
  // ここでは削除と再作成を繰り返して通知予約とメールを積む操作だけを抑える。
  organizationCreateDaily: {
    kind: "token bucket",
    rate: ORGANIZATION_CREATE_DAILY_LIMIT,
    period: DAY_MS,
    capacity: ORGANIZATION_CREATE_DAILY_LIMIT,
  },

  // 店舗・プラン・所属を変える事業者設定操作の同期的な連打防止。
  organizationSettingsMutationShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // 明示的なアカウント削除受付: issuer+subjectのSHA-256 hash単位。
  // 所属解消後の再試行余地を残しつつ、破壊操作の連打を抑える。
  accountDeletionRequest: {
    kind: "token bucket",
    rate: 3,
    period: HOUR_MS,
    capacity: 3,
  },

  // 本人メール変更の候補確認。Clerkへのコード送信前にactor単位で連打を抑える。
  accountEmailPreflight: {
    kind: "token bucket",
    rate: 10,
    period: HOUR_MS,
    capacity: 10,
  },

  // Clerk primaryのserver-side確認と全所属同期。部分失敗からの再試行余地を残す。
  accountEmailSync: {
    kind: "token bucket",
    rate: 6,
    period: HOUR_MS,
    capacity: 6,
  },

  // ログイン後の要望送信: userId 単位
  // 1回/分 — 連打と意図しない二重投稿を抑止
  featureRequestShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // ログイン後の要望送信: userId 単位
  // 10回/日 — 自由記述欄の乱用を抑止
  featureRequestDaily: {
    kind: "token bucket",
    rate: 10,
    period: DAY_MS,
    capacity: 10,
  },

  // スタッフの要望送信: staffId 単位
  // 1回/分 — 提出画面ヘッダーの連打を抑止
  staffFeatureRequestShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // スタッフの要望送信: staffId 単位
  // 10回/日 — 自由記述欄の乱用を抑止
  staffFeatureRequestDaily: {
    kind: "token bucket",
    rate: 10,
    period: DAY_MS,
    capacity: 10,
  },

  // 公開問い合わせ: 正規化メールのhash単位
  contactEmailShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // 公開問い合わせ: 正規化メールのhash単位
  contactEmailHourly: {
    kind: "token bucket",
    rate: 5,
    period: HOUR_MS,
    capacity: 5,
  },

  // 公開問い合わせ: 送信元IPのhash単位
  contactIpShort: {
    kind: "token bucket",
    rate: 3,
    period: MINUTE_MS,
    capacity: 3,
  },

  // 公開問い合わせ: 全体の暴発防止
  contactGlobal: {
    kind: "token bucket",
    rate: CONTACT_TURNSTILE_GLOBAL_SHORT_LIMIT,
    period: MINUTE_MS,
    capacity: CONTACT_TURNSTILE_GLOBAL_SHORT_LIMIT,
  },

  // 公開スタッフ登録: 正規化メール、登録link scope、信頼できる送信元IP、全体の多層budget。
  // HTTP ActionでSHA-256化した値だけをkeyとして受け取り、生のメール・token・IPは保持しない。
  staffRegistrationEmailShort: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_EMAIL_SHORT_LIMIT,
    period: MINUTE_MS,
    capacity: STAFF_REGISTRATION_EMAIL_SHORT_LIMIT,
  },

  staffRegistrationEmailDaily: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_EMAIL_DAILY_LIMIT,
    period: DAY_MS,
    capacity: STAFF_REGISTRATION_EMAIL_DAILY_LIMIT,
  },

  staffRegistrationLinkShort: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_LINK_SHORT_LIMIT,
    period: MINUTE_MS,
    capacity: STAFF_REGISTRATION_LINK_SHORT_LIMIT,
  },

  staffRegistrationLinkDaily: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_LINK_DAILY_LIMIT,
    period: DAY_MS,
    capacity: STAFF_REGISTRATION_LINK_DAILY_LIMIT,
  },

  staffRegistrationIpShort: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_IP_SHORT_LIMIT,
    period: MINUTE_MS,
    capacity: STAFF_REGISTRATION_IP_SHORT_LIMIT,
  },

  staffRegistrationIpDaily: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_IP_DAILY_LIMIT,
    period: DAY_MS,
    capacity: STAFF_REGISTRATION_IP_DAILY_LIMIT,
  },

  staffRegistrationGlobalShort: {
    kind: "token bucket",
    rate: STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT,
    period: MINUTE_MS,
    capacity: STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT,
  },
});

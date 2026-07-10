import { defineRateLimits } from "convex-helpers/server/rateLimit";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../constants";

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
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

  // LINE 連携トークン交換: state 先頭8文字をキーに
  // 5回/分 — ブルートフォース保険
  lineLinkRedeem: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE_MS,
    capacity: 5,
  },

  // LINE Webhook 受信: グローバル
  // 100回/分 — DDoS / 暴発時のセーフティネット
  lineWebhook: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE_MS,
    capacity: 100,
  },

  // LINE 連携依頼メール（個別送信）: shopId+staffId をキーに
  // 1回/分 — 同じスタッフへのダブルクリック送信を抑止
  lineInviteShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // スタッフ個別の通知再送: shopId+staffId+kind をキーに
  // 1回/分 — メニュー連打で同じ通知を積みすぎないための同期ガード
  staffNotificationResendShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
  },

  // 通知失敗Inboxからの手動再送: shopId+failureId をキーに
  // 1回/分 — 同じ失敗の連打再送で配送ジョブを揺らさないための同期ガード
  notificationFailureRetryShort: {
    kind: "token bucket",
    rate: 1,
    period: MINUTE_MS,
    capacity: 1,
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
    rate: 100,
    period: MINUTE_MS,
    capacity: 100,
  },
});

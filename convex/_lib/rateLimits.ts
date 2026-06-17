import { defineRateLimits } from "convex-helpers/server/rateLimit";
import { HOUR_MS, MINUTE_MS } from "../constants";

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
});

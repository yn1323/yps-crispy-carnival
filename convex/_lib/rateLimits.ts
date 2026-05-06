import { defineRateLimits } from "convex-helpers/server/rateLimit";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // マジックリンクトークン検証: トークン先頭8文字をキーに
  // 5回/分 — ブルートフォース保険
  verifyToken: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },

  // リンク再発行リクエスト: email+recruitmentId をキーに
  // 3回/時 — メール爆撃防止（Resend課金対策）
  requestReissue: {
    kind: "token bucket",
    rate: 3,
    period: HOUR,
    capacity: 3,
  },

  // シフト希望提出: staffId をキーに
  // 5回/分 — 連打防止
  submitShiftRequests: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },

  // LINE 連携トークン交換: state 先頭8文字をキーに
  // 5回/分 — ブルートフォース保険
  lineLinkRedeem: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },

  // LINE Webhook 受信: グローバル
  // 100回/分 — DDoS / 暴発時のセーフティネット
  lineWebhook: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    capacity: 100,
  },

  // LINE 連携依頼メール（個別送信）: shopId をキーに
  // 30回/時 — 個別ボタンの連打防止
  lineInvite: {
    kind: "token bucket",
    rate: 30,
    period: HOUR,
    capacity: 30,
  },

  // LINE 連携依頼メール（一括送信）: shopId をキーに
  // 3回/時 — 一斉送信の連打防止
  lineInviteBulk: {
    kind: "token bucket",
    rate: 3,
    period: HOUR,
    capacity: 3,
  },
});

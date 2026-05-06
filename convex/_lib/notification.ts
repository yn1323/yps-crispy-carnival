/**
 * 通知チャネル振り分け（純粋関数 / DB アクセスなし）
 *
 * 仕様:
 * - Quota 既知かつ exceeded → "email"
 * - LINE 連携済み（lineUserId あり）かつ友達追加中（lineFollowing=true） → "line"
 * - それ以外 → "email"
 *
 * Quota が未取得（cron 未実行）の場合は LINE 送信を試みる。
 * 実際に LINE Push が失敗した場合は呼び出し側で email にフォールバックする。
 */
export type LineNotificationStaff = {
  lineUserId?: string;
  lineFollowing?: boolean;
};

export type LineNotificationQuota = {
  status: "normal" | "exceeded";
};

export function selectChannel(staff: LineNotificationStaff, quota: LineNotificationQuota | null): "line" | "email" {
  if (quota?.status === "exceeded") return "email";
  if (staff.lineUserId && staff.lineFollowing) return "line";
  return "email";
}

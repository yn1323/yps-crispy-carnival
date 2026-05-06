/**
 * 通知チャネル振り分け（純粋関数 / DB アクセスなし）
 *
 * 仕様:
 * - LINE 連携済み（lineUserId あり）かつ友達追加中（lineFollowing=true）かつ Quota 残量あり → "line"
 * - それ以外 → "email"
 *
 * Quota が未取得（cron 未実行）の場合は安全側に倒して "email" を返す
 */
export type LineNotificationStaff = {
  lineUserId?: string;
  lineFollowing?: boolean;
};

export type LineNotificationQuota = {
  status: "normal" | "exceeded";
};

export function selectChannel(staff: LineNotificationStaff, quota: LineNotificationQuota | null): "line" | "email" {
  if (!quota || quota.status === "exceeded") return "email";
  if (staff.lineUserId && staff.lineFollowing) return "line";
  return "email";
}

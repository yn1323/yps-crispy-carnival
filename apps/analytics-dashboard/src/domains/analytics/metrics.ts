export const METRIC_LABELS: Record<string, string> = {
  "shop.created": "店舗作成",
  "staff.created": "スタッフ作成",
  "recruitment.created": "募集作成",
  "recruitment.confirmed": "シフト確定",
  "recruitment.confirmed.submittedTotal": "提出済み人数",
  "recruitment.confirmed.expectedStaffTotal": "提出対象人数",
  "submission.first": "初回提出",
  "line.linked": "LINE連携",
  "staffRegistration.requested": "スタッフ登録申請",
  "staffRegistration.approved": "スタッフ登録承認",
  "staffRegistration.rejected": "スタッフ登録却下",
};

export const RECRUITMENT_TREND_METRICS = ["recruitment.created", "submission.first", "recruitment.confirmed"] as const;

export const LINE_TREND_METRICS = ["line.linked"] as const;

export const SERVICE_TREND_METRICS = ["shop.created", "staff.created", "staffRegistration.requested"] as const;

export function metricLabel(metric: string) {
  if (METRIC_LABELS[metric]) return METRIC_LABELS[metric];
  if (metric.startsWith("notification.")) {
    const [, channel, outcome, kind] = metric.split(".");
    const channelLabel = channel === "line" ? "LINE" : "メール";
    const outcomeLabel = outcome === "failed" ? "失敗" : "送信";
    const kindLabels: Record<string, string> = {
      recruitment: "募集",
      reminder: "催促",
      confirmation: "確定",
      lineInvite: "LINE招待",
      other: "その他",
    };
    return `${channelLabel}${outcomeLabel}:${kindLabels[kind] ?? kind}`;
  }
  return metric;
}

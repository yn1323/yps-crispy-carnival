export const HELP_FEATURE_IDS = [
  "auth-pages",
  "contact",
  "dashboard-onboarding",
  "line-notification",
  "notification-history",
  "organization-billing",
  "shift-board",
  "shift-recruitment-management",
  "shift-submission",
  "shop-settings",
  "staff-registration",
] as const;

export type HelpFeatureId = (typeof HELP_FEATURE_IDS)[number];

export type HelpFeature = {
  id: HelpFeatureId;
  title: string;
};

/** `doc/features/<id>.md` と対応し、仕様変更時に関連ヘルプを探すためのレジストリ。 */
export const HELP_FEATURES = [
  { id: "auth-pages", title: "認証画面とアカウント設定" },
  { id: "contact", title: "問い合わせ" },
  { id: "dashboard-onboarding", title: "ダッシュボードの初回案内" },
  { id: "line-notification", title: "LINE通知連携" },
  { id: "notification-history", title: "スタッフ通知履歴" },
  { id: "organization-billing", title: "組織課金、複数店舗、複数管理者" },
  { id: "shift-board", title: "シフト表" },
  { id: "shift-recruitment-management", title: "シフト募集管理" },
  { id: "shift-submission", title: "希望シフト提出" },
  { id: "shop-settings", title: "店舗設定" },
  { id: "staff-registration", title: "スタッフ参加QR・承認導線" },
] as const satisfies readonly HelpFeature[];

export function getHelpFeature(id: string): HelpFeature | undefined {
  return HELP_FEATURES.find((feature) => feature.id === id);
}

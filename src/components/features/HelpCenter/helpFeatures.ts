export const HELP_FEATURE_IDS = [
  "account-deletion",
  "action-inbox",
  "auth-pages",
  "contact",
  "data-deletion",
  "dashboard-onboarding",
  "line-notification",
  "notification-failure-dashboard",
  "notification-history",
  "notification-outbox",
  "organization-billing",
  "shift-board",
  "shift-confirmation-reminder",
  "shift-exclusion",
  "shift-recruitment-management",
  "shift-submission",
  "shop-settings",
  "staff-registration",
  "trial-ending-dashboard-callout",
  "user-detail",
] as const;

export type HelpFeatureId = (typeof HELP_FEATURE_IDS)[number];

export type HelpFeature = {
  id: HelpFeatureId;
  title: string;
};

/** `doc/features/<id>.md` と対応し、仕様変更時に関連ヘルプを探すためのレジストリ。 */
export const HELP_FEATURES = [
  { id: "account-deletion", title: "アカウント削除" },
  { id: "action-inbox", title: "要対応一覧" },
  { id: "auth-pages", title: "認証画面とアカウント設定" },
  { id: "contact", title: "問い合わせ" },
  { id: "data-deletion", title: "データ削除" },
  { id: "dashboard-onboarding", title: "ダッシュボードの初回案内" },
  { id: "line-notification", title: "LINE通知連携" },
  { id: "notification-failure-dashboard", title: "通知不達の要対応" },
  { id: "notification-history", title: "スタッフ通知履歴" },
  { id: "notification-outbox", title: "通知Outbox" },
  { id: "organization-billing", title: "組織課金、複数店舗、複数管理者" },
  { id: "shift-board", title: "シフト表" },
  { id: "shift-confirmation-reminder", title: "シフト確定催促" },
  { id: "shift-exclusion", title: "シフト対象外" },
  { id: "shift-recruitment-management", title: "シフト募集管理" },
  { id: "shift-submission", title: "希望シフト提出" },
  { id: "shop-settings", title: "店舗設定" },
  { id: "staff-registration", title: "スタッフ参加QR・承認導線" },
  { id: "trial-ending-dashboard-callout", title: "トライアル終了案内" },
  { id: "user-detail", title: "ユーザー詳細" },
] as const satisfies readonly HelpFeature[];

export function getHelpFeature(id: string): HelpFeature | undefined {
  return HELP_FEATURES.find((feature) => feature.id === id);
}

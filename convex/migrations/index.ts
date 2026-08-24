import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";

export const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
});

// CI / CLI エントリポイント: `npx convex run migrations/index:run`
//
// 1ファイル1マイグレーション方式 — 詳細は `convex/CLAUDE.md` を参照。
//
// マイグレーションを追加するときは:
//   1. `convex/migrations/m{連番}_{名前}.ts` を作成し
//      `export const migration = migrations.define({...})` を書く
//   2. 下の runner 配列末尾に追加（連番欠番禁止）
export const run = migrations.runner([
  internal.migrations.m001_recruitments_add_shift_times.migration,
  internal.migrations.m002_shops_add_submission_pattern.migration,
  internal.migrations.m003_recruitments_add_submission_pattern.migration,
  internal.migrations.m004_notification_failure_inbox_backfill.migration,
  internal.migrations.m005_shop_billing_states_backfill_free.migration,
  internal.migrations.m006_notification_failure_inbox_collapse_duplicates.migration,
  internal.migrations.m007_shops_strip_legacy_shift_times.migration,
  internal.migrations.m008_recruitments_strip_legacy_shift_times.migration,
  internal.migrations.m009_shops_to_organizations.migration,
  internal.migrations.m010_shop_members_to_organization_members.migration,
  internal.migrations.m011_staffs_to_organization_people.migration,
  internal.migrations.m012_organizations_add_complimentary_business.migration,
  internal.migrations.m013_former_managers_remove_manager_access.migration,
  internal.migrations.m014_removed_organization_members_delete_legacy_shop_members.migration,
  internal.migrations.m015_organization_invitations_link_lifecycle.migration,
  internal.migrations.m016_deleted_shops_enqueue_cleanup_jobs.migration,
  internal.migrations.m017_deleted_organizations_enqueue_cleanup_jobs.migration,
  internal.migrations.m018_organization_billing_business_to_pro.migration,
  internal.migrations.m019_notification_outbox_terminal_redaction.migration,
  internal.migrations.m020_notification_failure_inbox_redaction.migration,
  internal.migrations.m021_organization_billing_complimentary_pro_to_business.migration,
  internal.migrations.m022_organization_billing_to_complimentary_business.migration,
  internal.migrations.m023_organization_invitations_narrow_prep.migration,
  internal.migrations.m024_notification_outbox_narrow_prep.migration,
  internal.migrations.m025_shops_narrow_prep.migration,
  internal.migrations.m026_shop_members_narrow_prep.migration,
  internal.migrations.m027_staffs_narrow_prep.migration,
  internal.migrations.m028_shop_billing_states_narrow_prep.migration,
  internal.migrations.m030_notification_fanout_operations_narrow_prep.migration,
  internal.migrations.m031_users_email_normalized_narrow_prep.migration,
  internal.migrations.m032_staffs_email_normalized_narrow_prep.migration,
  internal.migrations.m033_shift_submissions_first_submitted_at_narrow_prep.migration,
  internal.migrations.m034_positions_is_default_narrow_prep.migration,
  internal.migrations.m035_magic_links_access_kind_narrow_prep.migration,
  internal.migrations.m036_sessions_access_kind_narrow_prep.migration,
  internal.migrations.m037_notification_outbox_scope_narrow_prep.migration,
  internal.migrations.m038_recruitments_draft_saved_at_narrow_prep.migration,
  internal.migrations.m039_shops_regular_closed_days_narrow_prep.migration,
  internal.migrations.m040_recruitments_shop_closed_dates_narrow_prep.migration,
]);

// Widen対応版の確認と、衝突修復後にm012だけを限定再実行するために使う。
export const runM012 = migrations.runner(internal.migrations.m012_organizations_add_complimentary_business.migration);

// fixed seriesがdevelop CIで実行される前に、m018の限定dry runと競合確認に使う。
export const runM018 = migrations.runner(internal.migrations.m018_organization_billing_business_to_pro.migration);

// m021の限定dry runと、developmentでconflict修復後に対象だけを再評価するために使う。
export const runM021 = migrations.runner(
  internal.migrations.m021_organization_billing_complimentary_pro_to_business.migration,
);

// m022の限定dry runと、conflict裁定後に対象だけを再評価するために使う。
export const runM022 = migrations.runner(
  internal.migrations.m022_organization_billing_to_complimentary_business.migration,
);

// Narrow前の補完・再流入修復を、既存migration historyを書き換えずforward-onlyで実行する。
export const runNarrowPreparation = migrations.runner([
  internal.migrations.m023_organization_invitations_narrow_prep.migration,
  internal.migrations.m024_notification_outbox_narrow_prep.migration,
  internal.migrations.m025_shops_narrow_prep.migration,
  internal.migrations.m026_shop_members_narrow_prep.migration,
  internal.migrations.m027_staffs_narrow_prep.migration,
  internal.migrations.m028_shop_billing_states_narrow_prep.migration,
  internal.migrations.m030_notification_fanout_operations_narrow_prep.migration,
  internal.migrations.m031_users_email_normalized_narrow_prep.migration,
  internal.migrations.m032_staffs_email_normalized_narrow_prep.migration,
  internal.migrations.m033_shift_submissions_first_submitted_at_narrow_prep.migration,
  internal.migrations.m034_positions_is_default_narrow_prep.migration,
  internal.migrations.m035_magic_links_access_kind_narrow_prep.migration,
  internal.migrations.m036_sessions_access_kind_narrow_prep.migration,
  internal.migrations.m037_notification_outbox_scope_narrow_prep.migration,
  internal.migrations.m038_recruitments_draft_saved_at_narrow_prep.migration,
  internal.migrations.m039_shops_regular_closed_days_narrow_prep.migration,
  internal.migrations.m040_recruitments_shop_closed_dates_narrow_prep.migration,
]);

// canonical authorityとconflictの運用確認後にだけ、旧shopMembersを論理削除する明示runner。
// fixed seriesや包括prepへ含めず、dry runとreadinessを記録してから対象deploymentで実行する。
export const runShopMembersNarrowPreparation = migrations.runner(
  internal.migrations.m029_shop_members_narrow_prep.migration,
);

// NOT-03のWiden migration。runner/component標準のdryRun・cursor進捗・lib:getStatusで確認する。
export const runNotificationTerminalRedaction = migrations.runner([
  internal.migrations.m019_notification_outbox_terminal_redaction.migration,
  internal.migrations.m020_notification_failure_inbox_redaction.migration,
]);

// LINE共通化のexport/readinessでcounterpart欠損が1件以上、異常0件の場合だけ実行する。
// 完全ゼロ経路では実行しないため、fixed seriesには含めない。
export const runLineCommonLinkBackfill = migrations.runner(internal.migrations.m041_line_common_links.migration);

// plan ID cutover専用。Production exportの全readiness pageがblocking=0であり、
// scheduled billing jobと未完了billing通知が0件であることを確認した後にだけ明示実行する。
// fixed seriesには含めない。Narrow時はfresh replayでm012等がlegacy stateを生成した後にも走る
// forward canonicalizerをdefault series末尾へ別途追加し、歴史migration本体は変更しない。
export const runOrganizationBillingPlanIdsV2 = migrations.runner(
  internal.migrations.m042_organization_billing_plan_ids_v2.migration,
);

// m042完了後、Widen writerと並行してv1 source payloadが0件になるまで冪等に再実行する。
// 続けてcalculationVersion=2のanalytics resetを完走し、materialized tablesを再構築する。
export const runAnalyticsPlanIdsV2 = migrations.runner(internal.migrations.m043_analytics_plan_ids_v2.migration);

// dashboard announcementのcomma-separated targetをcanonicalへ揃える専用runner。
export const runDashboardAnnouncementPlanIdsV2 = migrations.runner(
  internal.migrations.m044_dashboard_announcement_plan_ids_v2.migration,
);

// conflict裁定後は、この範囲だけをresetして安全に再評価する。
export const runFormerManagerAccessCleanup = migrations.runner([
  internal.migrations.m013_former_managers_remove_manager_access.migration,
  internal.migrations.m014_removed_organization_members_delete_legacy_shop_members.migration,
]);

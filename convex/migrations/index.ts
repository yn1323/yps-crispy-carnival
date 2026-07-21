import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

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
]);

// Widen対応版の確認と、衝突修復後にm012だけを限定再実行するために使う。
export const runM012 = migrations.runner(internal.migrations.m012_organizations_add_complimentary_business.migration);

// fixed seriesがdevelop CIで実行される前に、m018の限定dry runと競合確認に使う。
export const runM018 = migrations.runner(internal.migrations.m018_organization_billing_business_to_pro.migration);

// m021の限定dry runと、developmentでconflict修復後に対象だけを再評価するために使う。
export const runM021 = migrations.runner(
  internal.migrations.m021_organization_billing_complimentary_pro_to_business.migration,
);

// NOT-03のWiden migration。runner/component標準のdryRun・cursor進捗・lib:getStatusで確認する。
export const runNotificationTerminalRedaction = migrations.runner([
  internal.migrations.m019_notification_outbox_terminal_redaction.migration,
  internal.migrations.m020_notification_failure_inbox_redaction.migration,
]);

// conflict裁定後は、この範囲だけをresetして安全に再評価する。
export const runFormerManagerAccessCleanup = migrations.runner([
  internal.migrations.m013_former_managers_remove_manager_access.migration,
  internal.migrations.m014_removed_organization_members_delete_legacy_shop_members.migration,
]);

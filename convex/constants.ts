import { ORGANIZATION_PLAN_LIMITS } from "./organizationBilling/planLimits";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const MAGIC_LINK_DEFAULT_TTL_MS = DAY_MS;
export const STAFF_SESSION_TTL_MS = 14 * DAY_MS;
export const STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE = 50;
export const LINE_LINK_TOKEN_TTL_MS = 72 * HOUR_MS;
export const LINE_WEBHOOK_MESSAGE_RECEIPT_RETENTION_MS = 30 * DAY_MS;
export const LINE_WEBHOOK_MESSAGE_RECEIPT_PRUNE_BATCH_SIZE = 100;
export const LINE_FRIENDSHIP_FANOUT_RETENTION_MS = 30 * DAY_MS;
export const LINE_FRIENDSHIP_FANOUT_BATCH_SIZE = 5;
export const LINE_FRIENDSHIP_FANOUT_LEASE_MS = MINUTE_MS;
export const LINE_FRIENDSHIP_FANOUT_MAX_ATTEMPTS = 8;
export const LINE_FRIENDSHIP_FANOUT_RECOVERY_BATCH_SIZE = 24;
export const LINE_FRIENDSHIP_FANOUT_PRUNE_BATCH_SIZE = 100;
export const LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX = 20;
// inactive店舗の所属履歴はactive上限へ数えない一方、人物単位の履歴走査自体は有限で停止する。
export const LINE_ORGANIZATION_PERSON_STAFF_HISTORY_SCAN_LIMIT = 100;
export const LEGAL_CONSENT_TOKEN_TTL_MS = 30 * DAY_MS;
export const RATE_LIMIT_RETRY_FALLBACK_MS = MINUTE_MS;
export const RESEND_EMAIL_SEND_INTERVAL_MS = 600;
export const RESEND_EMAIL_SEND_TIMEOUT_MS = 10_000;
export const RESEND_RETRY_DELAY_PADDING_MS = 250;
export const SUBMIT_ACTION_GUARD_WINDOW_MS = MINUTE_MS;
export const NOTIFICATION_OUTBOX_WORKER_BATCH_SIZE = 10;
export const NOTIFICATION_OUTBOX_ENQUEUE_DELAY_MS = 1_000;
// Convex の Node action 上限より長く保ち、provider 呼び出し中の job を横取りしない。
export const NOTIFICATION_OUTBOX_PROCESSING_LEASE_MS = 15 * MINUTE_MS;
export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 5;
export const NOTIFICATION_OUTBOX_RETRY_BASE_MS = MINUTE_MS;
export const NOTIFICATION_OUTBOX_RETRY_MAX_MS = HOUR_MS;
export const NOTIFICATION_DELIVERY_EVENT_RETENTION_MS = 90 * DAY_MS;
export const NOTIFICATION_DELIVERY_EVENT_PRUNE_BATCH_SIZE = 100;
export const RESEND_DELAYED_FAILURE_GRACE_MS = 30 * MINUTE_MS;
export const RESEND_DELAYED_FAILURE_RECOVERY_BATCH_SIZE = 100;
export const NOTIFICATION_FAILURE_INBOX_RETENTION_MS = 30 * DAY_MS;
export const NOTIFICATION_FAILURE_INBOX_EXPIRE_BATCH_SIZE = 100;
export const NOTIFICATION_OUTBOX_TERMINAL_PAYLOAD_RETENTION_MS = 30 * DAY_MS;
export const NOTIFICATION_OUTBOX_TERMINAL_REDACTION_BATCH_SIZE = 100;
// dry-run判定で一店舗から読み取るactive manager上限。超過時は通常配送へfail-safeする。
export const NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT = 20;
// 募集・確定通知は対象を永続化し、この件数ずつcursorを進める。
export const NOTIFICATION_FANOUT_BATCH_SIZE = 10;
export const NOTIFICATION_FANOUT_SCOPE_LIMIT = ORGANIZATION_PLAN_LIMITS.pro.maxPeople;
export const NOTIFICATION_FANOUT_CANCELLATION_BATCH_SIZE = 20;
// cron一回で再予約するfanout operation上限。予約漏れと期限切れleaseをboundedに回収する。
export const NOTIFICATION_FANOUT_RECOVERY_BATCH_SIZE = 20;
// Node action上限より長く保ち、中断時だけ通常schedulerから回収する。
export const NOTIFICATION_FANOUT_PROCESSING_LEASE_MS = 15 * MINUTE_MS;

export const SHIFT_BOARD_STAFF_LIMIT = 200;
export const DASHBOARD_ANNOUNCEMENT_CANDIDATE_LIMIT = 100;
export const DASHBOARD_RESPONSE_COUNT_LIMIT = 1000;
export const DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT = 500;
export const DASHBOARD_OPEN_RECRUITMENT_SCAN_LIMIT = 500;
export const DASHBOARD_RECRUITMENT_CANDIDATE_GROUP_LIMIT = 100;
// 組織横断シフト一覧は一店舗でも募集・staff・legacy提出を合わせて多数読むため、
// 店舗cursorを一件ずつ進めて単一queryのworkを固定上限内に保つ。
export const APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE = 1;
// recruitmentStats欠損時は正確な提出数ではなく、安全に確認できた下限値を返す。
// 一募集あたり1件とoverflow検知用1件に絞り、最悪時も単一queryのdocument read上限内に収める。
export const APP_ORGANIZATION_RECRUITMENT_LEGACY_SUBMISSION_COUNT_LIMIT = 1;
// ユーザー詳細で過去・停止中を含む店舗所属を安全に走査する上限。
export const ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT = 100;
// 50件の一括スタッフ追加でも、同一メールの人物履歴を一transactionで安全に分類できる上限。
export const ORGANIZATION_PERSON_EMAIL_HISTORY_SCAN_LIMIT = 20;
// ユーザー詳細へ返す同一組織店舗を安全に走査する上限。
export const ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT = 100;
// 人物削除を単一transactionで確定できる、今日以降のシフト割当上限。
export const ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT = 500;
// 店舗所属変更時に、open募集の回答数をactiveなシフト対象staffだけで再計算できる上限。
export const SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT = 50;
export const SHOP_MEMBERSHIP_STATS_ACTIVE_STAFF_LIMIT = 200;
export const SHOP_MEMBERSHIP_STATS_RECALCULATION_WORK_LIMIT = 8_000;
// 一人の利用者が自分で作成して保持できる組織数。招待による所属は数えない。
export const ORGANIZATION_SELF_CREATED_LIMIT = 3;
// 組織作成の日次上限。同時保持数は上記で決まるため、ここでは作り直しの回数だけを抑える。
export const ORGANIZATION_CREATE_DAILY_LIMIT = 10;
// TODO[narrow]: 全deploymentでm025〜m029が完走し、verifyShops/verifyLegacyShopMembersの全pageが0件になった後、
//   組織未所属の旧店舗の走査ごと削除する。
//   組織作成上限を数えるとき、移行前の店舗を1組織として扱うための走査上限。
export const ORGANIZATION_LEGACY_SHOP_SCAN_LIMIT = 50;
export const SHIFT_BOARD_SHIFT_REQUEST_LIMIT = 2000;
export const SHIFT_ASSIGNMENT_LIMIT = 2000;
// スタッフ個別通知の再送上限。actorを替えた回避も組織単位の上限で抑止する。
export const STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT = 10;
export const STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT = 20;
// 宛先を替えた回避も、organization（legacy店舗ではshop）×通知種別の配送対象数で抑止する。
export const STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT = 200;
export const STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_DAILY_LIMIT = 1000;
export const NOTIFICATION_RESEND_COOLDOWN_MS = 10 * MINUTE_MS;
// canonical人物の最大20所属と所属履歴の照合を含めてread上限内に収める、
// 1staffあたりの有限走査上限。
// 上限まで到達した場合は、未走査履歴を取りこぼさないよう安全側のcooldownを返す。
export const NOTIFICATION_RESEND_COOLDOWN_HISTORY_SCAN_LIMIT = 180;
export const RECRUITMENT_DUPLICATE_SCAN_LIMIT = 500;
export const OPEN_RECRUITMENT_NOTIFICATION_LIMIT = 50;
// スタッフ個別の確定シフト再送で、一度の操作に固定できる募集数。
export const CURRENT_SHIFT_NOTIFICATION_LIMIT = 40;
export const SHIFT_REQUESTS_PER_SUBMISSION_LIMIT = 31;
export const SHIFT_BOARD_TIME_UNIT_MINUTES = 30;
// 未認証のLINE OAuth callback全体で、無効stateによるDB lookupを抑止する上限。
export const LINE_LINK_REDEEM_GLOBAL_LIMIT = 100;
// 72時間内に異常発行されたtokenを一transactionで安全に失効できる上限。
export const LINE_LINK_ACTIVE_TOKEN_SCAN_LIMIT = 100;
export const STAFF_REGISTRATION_PENDING_LIMIT = 20;
export const STAFF_REGISTRATION_DAILY_DIGEST_PENDING_PAGE_SIZE = 100;
export const STAFF_REGISTRATION_DAILY_DIGEST_MANAGER_LIMIT = 20;
export const SHOP_NAME_MAX_LENGTH = 80;
export const ORGANIZATION_NAME_MAX_LENGTH = 80;
// 作成時の初期値にだけ使い、編集時は強制しない。
export const ORGANIZATION_NAME_SUFFIX = "グループ";
export const PERSON_NAME_MAX_LENGTH = 80;
export const SHIFT_TYPE_NAME_MAX_LENGTH = 30;
export const EMAIL_MAX_LENGTH = 254;
export const STAFF_ADD_ENTRIES_MAX = 50;
export const RECRUITMENT_PERIOD_DAYS_MAX = 31;
export const FEATURE_REQUEST_COMMENT_MAX_LENGTH = 200;
export const FEATURE_REQUEST_REQUEST_ID_MAX_LENGTH = 64;
export const FEATURE_REQUEST_LIST_LIMIT = 50;
export const LINE_WEBHOOK_BODY_MAX_BYTES = 1024 * 1024;
export const LINE_WEBHOOK_EVENT_MAX_COUNT = 100;
export const LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT = 100;
/** 一つのprovider userへ明示連携できるactive organization link上限。 */
export const LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX = 50;
/** staged dual-write中に一provider userへ存在し得るlegacy店舗projectionのbounded scan上限。 */
export const LINE_LEGACY_ACTIVE_ACCOUNT_SCAN_MAX =
  LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX * LINE_ORGANIZATION_PERSON_ACTIVE_STAFF_MAX;
/** @deprecated canonical link上限にはLINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAXを使う。 */
export const LINE_USER_ACTIVE_ACCOUNT_MAX = LINE_PROVIDER_ACTIVE_ORGANIZATION_LINK_MAX;
export const RESEND_WEBHOOK_BODY_MAX_BYTES = 64 * 1024;
export const STRIPE_WEBHOOK_BODY_MAX_BYTES = 128 * 1024;
export const STRIPE_WEBHOOK_SIGNATURE_MAX_LENGTH = 4096;
export const STRIPE_WEBHOOK_EVENT_RETENTION_MS = 90 * DAY_MS;
export const STRIPE_OPERATION_RETENTION_MS = 90 * DAY_MS;
export const STRIPE_OPERATION_PROCESSING_LEASE_MS = 15 * MINUTE_MS;
export const STRIPE_OPERATION_MAX_ATTEMPTS = 8;
export const CONTACT_NAME_MAX_LENGTH = 100;
export const CONTACT_ORGANIZATION_MAX_LENGTH = 100;
export const CONTACT_MESSAGE_MAX_LENGTH = 2000;
export const CONTACT_TURNSTILE_TOKEN_MAX_LENGTH = 2048;
export const CONTACT_HTTP_BODY_MAX_BYTES = 16 * 1024;
export const CONTACT_TURNSTILE_GLOBAL_SHORT_LIMIT = 100;
export const STAFF_REGISTRATION_TURNSTILE_TOKEN_MAX_LENGTH = 2048;
export const STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES = 8 * 1024;
// 公開登録はpending上限だけに依存せず、bot proof後の受付頻度も複数の安定keyで制限する。
export const STAFF_REGISTRATION_EMAIL_SHORT_LIMIT = 3;
export const STAFF_REGISTRATION_EMAIL_DAILY_LIMIT = 10;
export const STAFF_REGISTRATION_LINK_SHORT_LIMIT = 5;
export const STAFF_REGISTRATION_LINK_DAILY_LIMIT = 40;
export const STAFF_REGISTRATION_IP_SHORT_LIMIT = 10;
export const STAFF_REGISTRATION_IP_DAILY_LIMIT = 100;
export const STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT = 100;
// 承認依頼digestの通知期間。最新依頼からこの期間を過ぎたら通知しない（日次cronでは通常1回）
export const STAFF_REGISTRATION_DIGEST_WINDOW_MS = DAY_MS;

// シフト確定催促リマインダーで一度に通知するマネージャーの上限
export const SHIFT_CONFIRMATION_REMINDER_MANAGER_LIMIT = 20;

// 初回店舗登録後の本番募集リマインダーで一度に通知するマネージャーの上限
export const SHOP_ACTIVATION_REMINDER_MANAGER_LIMIT = 20;

// 失敗通知リマインダーの通知期間。最新の失敗からこの期間を過ぎたら通知しない（日次cronでは通常1回）
export const NOTIFICATION_FAILURE_REMINDER_WINDOW_MS = DAY_MS;
export const NOTIFICATION_FAILURE_REMINDER_PENDING_PAGE_SIZE = 100;
export const NOTIFICATION_FAILURE_REMINDER_MANAGER_LIMIT = 20;

// 分析KPI日次集計のページサイズ。イベント走査は1行=1読み取りなので大きめでよい
export const ANALYTICS_AGGREGATION_PAGE_SIZE = 100;
// 店舗スナップショット集計は店舗ごとにスタッフ・LINE連携・募集を読むため小さめにする
export const ANALYTICS_SHOP_SNAPSHOT_PAGE_SIZE = 10;
// 分析internalQueryが一度に返す時系列行数の上限（約2年分）
export const ANALYTICS_QUERY_RANGE_LIMIT = 731;
// 店舗ステージ判定で1店舗あたり走査する募集・提出統計・通知失敗の上限
export const ANALYTICS_SHOP_STAGE_SCAN_LIMIT = 200;

export const DEFAULT_POSITION_NAME = "シフト";
export const DEFAULT_POSITION_COLOR = "#3b82f6";

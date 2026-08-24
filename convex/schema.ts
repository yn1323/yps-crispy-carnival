import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rateLimitTables } from "convex-helpers/server/rateLimit";
import {
  persistedShiftAssignmentValidator,
  shiftConfirmationSnapshotAssignmentValidator,
} from "./_lib/shiftAssignmentValidators";
import { submissionPatternValidator } from "./_lib/submissionPattern";
import {
  analyticsCadenceValidator,
  analyticsCompletenessValidator,
  analyticsHealthSignalCountsValidator,
  analyticsHealthSignalStateValidator,
  analyticsMilestoneCountsValidator,
  analyticsMilestoneDatesValidator,
  analyticsNotificationKindValidator,
  analyticsPlanValidator,
  analyticsRatePairValidator,
  analyticsRunKindValidator,
  analyticsRunStageValidator,
  analyticsRunStatusValidator,
  analyticsSegmentDimensionValidator,
  analyticsSourceEventPayloadValidator,
  analyticsSourceEventTypeValidator,
} from "./analytics/model";
import {
  notificationFanoutCancelReasonValidator,
  notificationFanoutKindValidator,
  notificationFanoutPurposeValidator,
  notificationFanoutStatusValidator,
} from "./notification/fanout";
import {
  notificationCancelReasonValidator,
  notificationChannelValidator,
  notificationDeliveryEventTypeValidator,
  notificationFailureInboxSourceTypeValidator,
  notificationFailureInboxStatusValidator,
  notificationFailureResolutionKindValidator,
  notificationHistoryDeliveryStatusValidator,
  notificationHistorySendStatusValidator,
  notificationOutboxStatusValidator,
  notificationPayloadValidator,
  notificationPurposeValidator,
  resendProviderDeliveryStatusValidator,
  resendProviderEventTypeValidator,
  resendProviderIssueEventTypeValidator,
} from "./notificationOutbox/schemas";
import {
  organizationBillingStateValidator,
  organizationInvitationPurposeValidator,
  organizationInvitationStatusValidator,
  organizationMemberStatusValidator,
  organizationPersonStatusValidator,
  organizationShopOperatingStatusValidator,
} from "./organization/validators";
import {
  organizationStripeOperationKindValidator,
  organizationStripeOperationStatusValidator,
  organizationStripeSubscriptionStatusValidator,
  stripeWebhookEventStatusValidator,
  stripeWebhookEventTypeValidator,
  trialSubscriptionCreateSnapshotValidator,
} from "./organizationStripe/validators";

const schema = defineSchema({
  ...rateLimitTables,
  // ========================================
  // 店舗情報
  // ========================================
  shops: defineTable({
    // TODO[narrow]: Widen -> Migrate -> Narrow の2段階目。
    //   前提: 全deploymentでm025が完走し、verifyShopsの全pageで欠損・danglingが0件であること。
    //   対応: v.optional() を外して v.id("organizations") にする。
    organizationId: v.optional(v.id("organizations")),
    // TODO[narrow]: Widen -> Migrate -> Narrow の2段階目。
    //   前提: 全deploymentでm025が完走し、verifyShopsの全pageで欠損・danglingが0件であること。
    //   対応: v.optional() を外して organizationShopOperatingStatusValidator にする。
    operatingStatus: v.optional(organizationShopOperatingStatusValidator),
    name: v.string(),
    // TODO[narrow]: 全deploymentでm039のshop workerが完走し、verifyShopsの
    // missingRegularClosedDaysが0件になった後にrequiredへ戻す。
    regularClosedDays: v.optional(
      v.array(
        v.union(
          v.literal("sun"),
          v.literal("mon"),
          v.literal("tue"),
          v.literal("wed"),
          v.literal("thu"),
          v.literal("fri"),
          v.literal("sat"),
        ),
      ),
    ),
    submissionPattern: submissionPatternValidator,
    isDeleted: v.boolean(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_isDeleted", ["organizationId", "isDeleted"])
    .index("by_organizationId_and_operatingStatus", ["organizationId", "operatingStatus"])
    .index("by_organizationId_and_operatingStatus_and_isDeleted", ["organizationId", "operatingStatus", "isDeleted"]),

  // ========================================
  // 事業者・人物・管理者所属
  // ========================================
  organizations: defineTable({
    createdByUserId: v.optional(v.id("users")),
    migrationSourceShopId: v.optional(v.id("shops")),
    name: v.string(),
    // TODO[narrow]: Widen -> Migrate -> Narrow の2段階目。
    //   前提: 既存事業者の初期請求連絡先を運用確認して補完し、develop/prodの未設定件数が
    //   0件であること（確認: verifyOrganizationsの全page）。
    //   対応: v.optional() を外して v.string() にする。
    billingEmail: v.optional(v.string()),
    // TODO[narrow]: Widen -> Migrate -> Narrow の2段階目。
    //   前提: billingEmail と同じ補完が完了し、develop/prodの未設定件数が0件であること
    //   （確認: verifyOrganizationsの全page）。
    //   対応: v.optional() を外して v.string() にする。
    billingEmailNormalized: v.optional(v.string()),
    // Stripe Customer同期の世代を識別する非PIIのopaque key。既存行は未設定を許容する。
    billingEmailSyncKey: v.optional(v.string()),
    isDeleted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdByUserId", ["createdByUserId"])
    .index("by_createdByUserId_and_isDeleted", ["createdByUserId", "isDeleted"])
    .index("by_migrationSourceShopId", ["migrationSourceShopId"]),

  organizationPeople: defineTable({
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.string(),
    emailNormalized: v.string(),
    status: organizationPersonStatusValidator,
    // LINE連携の解除・再連携ごとに進める世代。既存rowの欠損は0として読む。
    lineLinkGeneration: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_emailNormalized", ["organizationId", "emailNormalized"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_organizationId_and_userId", ["organizationId", "userId"])
    .index("by_userId_and_status", ["userId", "status"]),

  // スタッフ並び順は既存の人物・スタッフtableへindex backfillを要求しないよう、
  // 空で追加できる派生tableへ保持する。stateがない組織は従来順を正とする。
  organizationStaffOrderStates: defineTable({
    organizationId: v.id("organizations"),
    revision: v.number(),
    activatedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  organizationStaffOrderEntries: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    displayOrder: v.number(),
  })
    .index("by_organizationId_and_displayOrder", ["organizationId", "displayOrder"])
    .index("by_organizationId_and_organizationPersonId", ["organizationId", "organizationPersonId"]),

  shopStaffOrderEntries: defineTable({
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    organizationPersonId: v.id("organizationPeople"),
    displayOrder: v.number(),
  })
    .index("by_shopId_and_displayOrder", ["shopId", "displayOrder"])
    .index("by_shopId_and_staffId", ["shopId", "staffId"])
    .index("by_organizationId_and_organizationPersonId", ["organizationId", "organizationPersonId"])
    .index("by_organizationId_and_shopId", ["organizationId", "shopId"]),

  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    personId: v.id("organizationPeople"),
    userId: v.id("users"),
    status: organizationMemberStatusValidator,
    invitedByMemberId: v.optional(v.id("organizationMembers")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_userId_and_organizationId", ["userId", "organizationId"])
    .index("by_organizationId_and_personId", ["organizationId", "personId"]),

  organizationInvitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    emailNormalized: v.string(),
    // TODO[narrow]: Make required after m023 and verifyOrganizationInvitations have completed everywhere.
    invitedName: v.optional(v.string()),
    tokenDigest: v.string(),
    status: organizationInvitationStatusValidator,
    // TODO[narrow]: m023でWiden前の招待を補完し、全deploymentのstatusと
    //   verifyOrganizationInvitations全pageのmissingPurposeが0件であることを確認後、v.optional()を外し、
    //   organizationInvitation/service.tsのmanagerAddition fallbackも削除する。
    purpose: v.optional(organizationInvitationPurposeValidator),
    inviterMemberId: v.id("organizationMembers"),
    // 人物詳細またはスタッフ詳細から発行した招待だけ、アカウント連携対象の人物を固定する。
    // 外部の新規人物向け招待では未設定が正しい。
    targetPersonId: v.optional(v.id("organizationPeople")),
    reservedSeat: v.boolean(),
    version: v.number(),
    predecessorInvitationId: v.optional(v.id("organizationInvitations")),
    expiresAt: v.number(),
    sentAt: v.optional(v.number()),
    linkedAt: v.optional(v.number()),
    linkedByPersonId: v.optional(v.id("organizationPeople")),
    // TODO[narrow]: Remove accepted* after m023 has copied and unset all legacy values in every deployment.
    acceptedAt: v.optional(v.number()),
    acceptedByPersonId: v.optional(v.id("organizationPeople")),
    revokedAt: v.optional(v.number()),
    expiredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_tokenDigest", ["tokenDigest"])
    .index("by_organizationId_and_emailNormalized_and_status", ["organizationId", "emailNormalized", "status"])
    .index("by_organizationId_and_targetPersonId_and_status", ["organizationId", "targetPersonId", "status"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_organizationId_and_status_and_expiresAt", ["organizationId", "status", "expiresAt"])
    .index("by_inviterMemberId_and_status", ["inviterMemberId", "status"])
    .index("by_expiresAt", ["expiresAt"]),

  organizationBillingStates: defineTable({
    organizationId: v.id("organizations"),
    state: organizationBillingStateValidator,
    freeManagerPersonId: v.optional(v.id("organizationPeople")),
    freeShopId: v.optional(v.id("shops")),
    businessNotificationCutoffAt: v.optional(v.number()),
    businessNotificationCutoffVersion: v.optional(v.number()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  // 通常課金組織だけが持つStripe Customer対応。支払い不要プランでは行を作らない。
  organizationStripeCustomers: defineTable({
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    livemode: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_livemode_and_stripeCustomerId", ["livemode", "stripeCustomerId"]),

  // 終了済みを含むSubscription世代を保持し、旧Invoiceからの誤復旧を防ぐ。
  organizationStripeSubscriptions: defineTable({
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.optional(v.string()),
    stripePriceId: v.string(),
    // TODO[narrow]: verifyStripeSubscriptionsの全pageとprovider snapshotでPriceを照合し、必要なら新しい
    //   forward migrationでplanを補完してからrequired化する。現在のPriceやproを推測値として使わない。
    plan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
    livemode: v.boolean(),
    status: organizationStripeSubscriptionStatusValidator,
    providerGeneration: v.number(),
    trialEndsAt: v.optional(v.number()),
    currentPeriodStartsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    billingCycleAnchor: v.optional(v.number()),
    stripeSubscriptionScheduleId: v.optional(v.string()),
    cancelAtPeriodEnd: v.boolean(),
    latestInvoiceId: v.optional(v.string()),
    lastStripeEventCreatedAt: v.optional(v.number()),
    lastStripeEventId: v.optional(v.string()),
    terminalAt: v.optional(v.number()),
    syncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_providerGeneration", ["organizationId", "providerGeneration"])
    .index("by_organizationId_and_status_and_terminalAt", ["organizationId", "status", "terminalAt"])
    .index("by_livemode_and_stripeSubscriptionId", ["livemode", "stripeSubscriptionId"])
    .index("by_livemode_and_stripeSubscriptionScheduleId", ["livemode", "stripeSubscriptionScheduleId"])
    .index("by_livemode_and_latestInvoiceId", ["livemode", "latestInvoiceId"])
    .index("by_livemode_and_stripeCustomerId", ["livemode", "stripeCustomerId"]),

  // Stripeへの各副作用を論理operationとして永続化し、再試行時も同じidempotency keyを使う。
  organizationStripeOperations: defineTable({
    organizationId: v.id("organizations"),
    kind: organizationStripeOperationKindValidator,
    requestKey: v.string(),
    stripeIdempotencyKey: v.string(),
    livemode: v.boolean(),
    expectedBillingVersion: v.optional(v.number()),
    providerGeneration: v.optional(v.number()),
    sourcePlan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
    targetPlan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"))),
    // targetPlan=freeの旧予約と、新しい「期間末解約」をrolling互換で識別する。
    restrictAtPeriodEnd: v.optional(v.literal(true)),
    changeMode: v.optional(v.union(v.literal("checkout"), v.literal("immediate"), v.literal("periodEnd"))),
    stripeSubscriptionIdSnapshot: v.optional(v.string()),
    stripeSubscriptionItemIdSnapshot: v.optional(v.string()),
    sourceStripePriceIdSnapshot: v.optional(v.string()),
    targetStripePriceIdSnapshot: v.optional(v.string()),
    prorationDate: v.optional(v.number()),
    effectiveAt: v.optional(v.number()),
    // cancelSubscription / reconcileSubscription の回収先を識別する。既存operationは猶予終了回収として扱う。
    recoveryPurpose: v.optional(
      v.union(
        v.literal("trialContinuationCancellation"),
        v.literal("invalidTrialSubscriptionCancellation"),
        v.literal("scheduledFreeDeadline"),
        v.literal("scheduledPaidPlanDeadline"),
      ),
    ),
    // 無効なTrial Subscriptionのcleanupでは、作成元operationとの所有関係を固定する。
    sourceOperationId: v.optional(v.id("organizationStripeOperations")),
    // Checkout開始時に確認したPrice。env rotation後も進行中operationを別価格へ差し替えない。
    stripePriceIdSnapshot: v.optional(v.string()),
    // Provider createの引数を固定し、応答直後のhard crashでも同じintentだけを回収する。
    trialSubscriptionCreateSnapshot: v.optional(trialSubscriptionCreateSnapshotValidator),
    stripeObjectId: v.optional(v.string()),
    status: organizationStripeOperationStatusValidator,
    attemptCount: v.number(),
    nextRunAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_kind_and_requestKey", ["organizationId", "kind", "requestKey"])
    .index("by_organizationId_and_kind_and_status", ["organizationId", "kind", "status"])
    .index("by_organizationId_and_recoveryPurpose_and_status", ["organizationId", "recoveryPurpose", "status"])
    .index("by_organizationId_and_providerGeneration", ["organizationId", "providerGeneration"])
    .index("by_organizationId_and_providerGeneration_and_kind_and_status", [
      "organizationId",
      "providerGeneration",
      "kind",
      "status",
    ])
    .index("by_organizationId_and_stripeObjectId", ["organizationId", "stripeObjectId"])
    .index("by_livemode_and_stripeObjectId", ["livemode", "stripeObjectId"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"])
    .index("by_kind_and_status", ["kind", "status"])
    .index("by_kind_and_status_and_nextRunAt", ["kind", "status", "nextRunAt"])
    .index("by_kind_and_status_and_leaseExpiresAt", ["kind", "status", "leaseExpiresAt"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"])
    .index("by_expiresAt", ["expiresAt"]),

  // raw bodyや署名は保存せず、再取得に必要なprovider event/object識別子だけを保持する。
  stripeWebhookEvents: defineTable({
    stripeEventId: v.string(),
    type: stripeWebhookEventTypeValidator,
    apiVersion: v.optional(v.string()),
    livemode: v.boolean(),
    objectId: v.string(),
    // 署名検証済みpayload由来。provider取得前のfail-closed guard専用で、状態更新の権威にはしない。
    objectCustomerId: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    providerGeneration: v.optional(v.number()),
    eventCreatedAt: v.number(),
    status: stripeWebhookEventStatusValidator,
    attemptCount: v.number(),
    nextRunAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stripeEventId", ["stripeEventId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"])
    .index("by_status_and_processedAt", ["status", "processedAt"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"])
    .index("by_expiresAt", ["expiresAt"]),

  organizationAuditEvents: defineTable({
    organizationId: v.id("organizations"),
    actorUserId: v.optional(v.id("users")),
    actorPersonId: v.optional(v.id("organizationPeople")),
    action: v.string(),
    targetKind: v.optional(v.string()),
    targetId: v.optional(v.string()),
    fromState: v.optional(v.string()),
    toState: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_organizationId_and_occurredAt", ["organizationId", "occurredAt"])
    .index("by_actorUserId_and_occurredAt", ["actorUserId", "occurredAt"])
    .index("by_actorPersonId_and_occurredAt", ["actorPersonId", "occurredAt"])
    .index("by_correlationId", ["correlationId"]),

  organizationMigrationConflicts: defineTable({
    organizationId: v.optional(v.id("organizations")),
    sourceType: v.string(),
    sourceId: v.string(),
    code: v.string(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_sourceType_and_sourceId_and_code", ["sourceType", "sourceId", "code"])
    .index("by_code_and_resolvedAt", ["code", "resolvedAt"])
    .index("by_organizationId_and_resolvedAt", ["organizationId", "resolvedAt"]),

  // 削除受付後のaccess失効と通知停止を、bounded batchで再開可能に進める。
  // 氏名・メール・名称は元の値を保持し、jobには対象IDと安全な進捗codeだけを保存する。
  deletionCleanupJobs: defineTable({
    scope: v.union(v.literal("shop"), v.literal("organization")),
    shopId: v.optional(v.id("shops")),
    organizationId: v.optional(v.id("organizations")),
    requestId: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("retrying"),
      v.literal("actionRequired"),
      v.literal("completed"),
    ),
    phase: v.string(),
    resource: v.optional(v.string()),
    cursor: v.optional(v.string()),
    shopCursor: v.optional(v.string()),
    currentShopId: v.optional(v.id("shops")),
    version: v.number(),
    attemptCount: v.number(),
    nextRunAt: v.number(),
    leaseId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_requestId", ["requestId"])
    .index("by_shopId_and_status", ["shopId", "status"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"]),

  // 明示的なアカウント削除要求だけをClerk削除へ収束させる。
  // provider識別子は完了transactionでredactし、completed jobは90日後にpruneする。
  accountDeletionJobs: defineTable({
    userId: v.id("users"),
    requestId: v.string(),
    clerkUserId: v.optional(v.string()),
    expectedIssuer: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("retrying"),
      v.literal("actionRequired"),
      v.literal("completed"),
    ),
    phase: v.union(
      v.literal("waitForOrganizationCleanup"),
      v.literal("waitForSharedCleanup"),
      v.literal("verifyProviderUser"),
      v.literal("deleteProviderUser"),
      v.literal("complete"),
    ),
    // 組織削除を伴う要求だけが持つ。optional wideningのため既存jobのbackfillは不要。
    organizationCleanup: v.optional(
      v.object({
        organizationId: v.id("organizations"),
        jobId: v.id("deletionCleanupJobs"),
      }),
    ),
    // 共有組織からの退出で削除する通知履歴を追跡する。optional wideningのため既存jobのbackfillは不要。
    sharedCleanup: v.optional(
      v.object({
        organizationId: v.id("organizations"),
        targets: v.array(
          v.object({
            shopId: v.id("shops"),
            staffId: v.id("staffs"),
          }),
        ),
      }),
    ),
    version: v.number(),
    attemptCount: v.number(),
    nextRunAt: v.number(),
    leaseId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    providerUserVerifiedAt: v.optional(v.number()),
    deleteAttemptedAt: v.optional(v.number()),
    providerDeletedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_requestId", ["userId", "requestId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"]),

  shopBillingStates: defineTable({
    shopId: v.id("shops"),
    planKey: v.union(v.literal("free"), v.literal("standard"), v.literal("premium")),
    source: v.union(v.literal("system"), v.literal("manual")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_shopId", ["shopId"]),

  // ========================================
  // 管理者ユーザー（Clerk認証）
  // ========================================
  users: defineTable({
    authTokenIdentifier: v.string(),
    name: v.string(),
    // 初回bootstrapとcanonical personを持たないlegacy経路のsnapshot。Clerkやシフト連絡先とは同期しない。
    email: v.string(),
    // TODO[narrow]: 全deploymentでm031が完走し、verifyUsersのemail残件が全pageで0になった後にrequired化する。
    emailNormalized: v.optional(v.string()),
    // TODO[narrow]: verifyUsersのlegacyAdminRoleが全deployment・全pageで0と確認できた後にmanager literalだけへ狭める。
    // adminをmanagerへ自動変換すると権限判断になるため、forward migrationでは推測しない。
    role: v.union(v.literal("admin"), v.literal("manager")),
    isDeleted: v.boolean(),
    // 明示的なaccount deletion受付だけに設定する。legacy tombstoneからbackfillしない。
    accountDeletionRequestedAt: v.optional(v.number()),
    dashboardOnboardingDismissedAt: v.optional(v.number()),
  })
    .index("by_authTokenIdentifier", ["authTokenIdentifier"])
    .index("by_isDeleted_and_accountDeletionRequestedAt", ["isDeleted", "accountDeletionRequestedAt"]),

  shopMembers: defineTable({
    shopId: v.id("shops"),
    userId: v.id("users"),
    role: v.literal("manager"),
    isDeleted: v.boolean(),
  })
    .index("by_shopId_and_isDeleted", ["shopId", "isDeleted"])
    .index("by_userId_and_isDeleted", ["userId", "isDeleted"])
    .index("by_userId_and_shopId", ["userId", "shopId"])
    .index("by_userId_and_shopId_and_isDeleted", ["userId", "shopId", "isDeleted"]),

  featureRequests: defineTable({
    // 送信時点で店舗が確定していればshopId、組織全体の文脈ならorganizationIdを保存する。
    // public mutationでどちらか一方を必須にし、旧documentはshopIdのまま互換維持する。
    organizationId: v.optional(v.id("organizations")),
    shopId: v.optional(v.id("shops")),
    // 管理者要望はuserId、スタッフ要望はstaffIdで送信者をサーバー側から確定する。
    userId: v.optional(v.id("users")),
    staffId: v.optional(v.id("staffs")),
    comment: v.string(),
    requestId: v.string(),
  })
    .index("by_shopId", ["shopId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_userId_and_requestId", ["userId", "requestId"])
    .index("by_staffId_and_requestId", ["staffId", "requestId"]),

  // ========================================
  // ダッシュボードお知らせ（全体・事業者・店舗・契約プラン対象）
  // ========================================
  dashboardAnnouncements: defineTable({
    // 単一IDまたは半角カンマ区切りの複数ID。表示制御用であり認可には使わない。
    organizationId: v.optional(v.string()),
    shopId: v.optional(v.string()),
    // 半角カンマ区切りでtrial,free,pro,businessを指定する。支払い不要Pro相当も内部businessへ解決する。
    organizationPlan: v.optional(v.string()),
    title: v.string(),
    bodyHtml: v.string(),
    displayDate: v.string(), // "2026-06-17"
    isPublished: v.boolean(),
    isDeleted: v.boolean(),
  }).index("by_isPublished_and_isDeleted_and_displayDate", ["isPublished", "isDeleted", "displayDate"]),

  // ========================================
  // スタッフ
  // ========================================
  staffs: defineTable({
    shopId: v.id("shops"),
    // TODO[narrow]: Widen -> Migrate -> Narrow の2段階目。
    //   前提: 全deploymentでm026/m027が完走し、verifyStaffsとverifyOrganizationMigrationConflictsの
    //   全pageが0件であること。
    //   対応: v.optional() を外して v.id("organizations") にする。
    organizationId: v.optional(v.id("organizations")),
    // TODO[narrow]: Widen -> Migrate -> Narrow の2段階目。
    //   前提: 全deploymentでm026/m027が完走し、verifyStaffsとverifyOrganizationMigrationConflictsの
    //   全pageが0件であること。
    //   対応: v.optional() を外して v.id("organizationPeople") にする。
    organizationPersonId: v.optional(v.id("organizationPeople")),
    name: v.string(),
    email: v.string(),
    // TODO[narrow]: 全deploymentでm032が完走し、verifyStaffsのemail残件が全pageで0になった後にrequired化する。
    emailNormalized: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    // TODO[narrow]: 全deploymentでm027が完走し、verifyStaffsのmissingExcludedFromShiftが0件になった後にrequired化する。
    // シフト対象外フラグ（店舗共通アドレス等、シフトを出さないスタッフ）。旧rowの未定義は false 扱い。
    excludedFromShift: v.optional(v.boolean()),
    isDeleted: v.boolean(),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_isDeleted", ["shopId", "isDeleted"])
    .index("by_shopId_email_isDeleted", ["shopId", "email", "isDeleted"])
    .index("by_shopId_emailNormalized_isDeleted", ["shopId", "emailNormalized", "isDeleted"])
    .index("by_userId_and_shopId", ["userId", "shopId"])
    .index("by_userId_and_isDeleted", ["userId", "isDeleted"])
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_organizationPersonId", ["organizationId", "organizationPersonId"])
    .index("by_organizationId_and_organizationPersonId_and_isDeleted", [
      "organizationId",
      "organizationPersonId",
      "isDeleted",
    ])
    .index("by_email", ["email"])
    .index("by_emailNormalized", ["emailNormalized"]),

  staffLineAccounts: defineTable({
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    lineUserId: v.string(),
    linkedAt: v.number(),
    following: v.boolean(),
    lastWebhookAt: v.optional(v.number()),
    // optional widening: legacy rowは最初の署名済みevent受信時に更新するためbackfill不要。
    lastWebhookEventId: v.optional(v.string()),
    lastWebhookEventTimestamp: v.optional(v.number()),
    isDeleted: v.boolean(),
  })
    .index("by_staffId", ["staffId"])
    .index("by_staffId_and_isDeleted", ["staffId", "isDeleted"])
    .index("by_shopId", ["shopId"])
    .index("by_shopId_and_isDeleted", ["shopId", "isDeleted"])
    .index("by_lineUserId", ["lineUserId"])
    .index("by_lineUserId_and_isDeleted", ["lineUserId", "isDeleted"])
    // 分析KPI: 日次窓（JST）でのLINE連携完了のレンジスキャン用（再連携でもlinkedAtは初回値を保持）
    .index("by_linkedAt", ["linkedAt"]),

  // LINE provider上の友だち状態はorganizationをまたいで一つだけ保持する。
  lineProviderUsers: defineTable({
    lineUserId: v.string(),
    following: v.boolean(),
    stateVersion: v.number(),
    friendshipObservedAt: v.number(),
    friendshipObservationSource: v.union(v.literal("oauth"), v.literal("webhook")),
    lastWebhookAt: v.optional(v.number()),
    lastWebhookEventId: v.optional(v.string()),
    lastWebhookEventTimestamp: v.optional(v.number()),
    isDeleted: v.boolean(),
  }).index("by_lineUserId_and_isDeleted", ["lineUserId", "isDeleted"]),

  // organizationごとの明示連携。同じpersonの全店舗所属でこの一行を共有する。
  organizationPersonLineLinks: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    lineProviderUserId: v.id("lineProviderUsers"),
    generation: v.number(),
    linkedAt: v.number(),
    isDeleted: v.boolean(),
    unlinkedAt: v.optional(v.number()),
  })
    .index("by_organizationPersonId_and_isDeleted", ["organizationPersonId", "isDeleted"])
    .index("by_organizationId_and_lineProviderUserId_and_isDeleted", [
      "organizationId",
      "lineProviderUserId",
      "isDeleted",
    ])
    .index("by_lineProviderUserId_and_isDeleted", ["lineProviderUserId", "isDeleted"])
    .index("by_organizationId_and_isDeleted", ["organizationId", "isDeleted"]),

  // 友だち状態変更をorganization link単位へboundedに反映する進捗。
  // provider IDだけを保持し、raw LINE IDやtoken、人物PIIは保存しない。
  lineFriendshipFanoutJobs: defineTable({
    lineProviderUserId: v.id("lineProviderUsers"),
    stateVersion: v.number(),
    following: v.boolean(),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("retrying"),
      v.literal("actionRequired"),
      v.literal("completed"),
      v.literal("superseded"),
    ),
    cursor: v.optional(v.string()),
    version: v.number(),
    attemptCount: v.number(),
    nextRunAt: v.number(),
    leaseId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_status_and_nextRunAt", ["status", "nextRunAt"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"])
    .index("by_lineProviderUserId_and_stateVersion", ["lineProviderUserId", "stateVersion"])
    .index("by_expiresAt", ["expiresAt"]),

  // message Webhookの外部Reply APIを一回だけ実行するためのreceipt。
  // reply token、送信元、message ID、本文は保存しない。
  lineWebhookMessageReceipts: defineTable({
    webhookEventId: v.string(),
    expiresAt: v.number(),
  })
    .index("by_webhookEventId", ["webhookEventId"])
    .index("by_expiresAt", ["expiresAt"]),

  shopRegistrationLinks: defineTable({
    shopId: v.id("shops"),
    token: v.string(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_shopId", ["shopId"])
    .index("by_shopId_and_revokedAt", ["shopId", "revokedAt"]),

  staffRegistrationRequests: defineTable({
    shopId: v.id("shops"),
    name: v.string(),
    email: v.string(),
    emailNormalized: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    termsConsentVersion: v.string(),
    privacyConsentVersion: v.string(),
    termsDocumentVersion: v.string(),
    privacyDocumentVersion: v.string(),
    consentedAt: v.number(),
    approvedStaffId: v.optional(v.id("staffs")),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_shopId_status", ["shopId", "status"])
    .index("by_shopId_emailNormalized_status", ["shopId", "emailNormalized", "status"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    // 分析KPI: 日次窓（JST）での承認/却下のレンジスキャン用
    .index("by_status_and_reviewedAt", ["status", "reviewedAt"]),

  legalConsentStates: defineTable({
    subjectType: v.union(v.literal("user"), v.literal("staff")),
    userId: v.optional(v.id("users")),
    staffId: v.optional(v.id("staffs")),
    shopId: v.id("shops"),
    termsConsentVersion: v.string(),
    privacyConsentVersion: v.string(),
    termsDocumentVersion: v.string(),
    privacyDocumentVersion: v.string(),
    consentedAt: v.number(),
    method: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_staffId", ["staffId"])
    .index("by_shopId", ["shopId"]),

  // ========================================
  // シフト募集
  // ========================================
  recruitments: defineTable({
    shopId: v.id("shops"),
    periodStart: v.string(), // "2026-01-20"
    periodEnd: v.string(), // "2026-01-26"
    deadline: v.string(), // "2026-01-17"
    // TODO[narrow]: 全deploymentでm040が完走し、verifyRecruitmentsの
    // missingShopClosedDatesが0件になった後にrequiredへ戻す。
    shopClosedDates: v.optional(v.array(v.string())), // 募集期間内でお店を開けない日
    status: v.union(v.literal("open"), v.literal("confirmed")),
    confirmedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(),
    submissionPattern: submissionPatternValidator,
    // 未提出者への自動催促通知を予約した時刻。既存募集には付与せず、作成時に未来時刻のものだけ保存する。
    reminderScheduledAt: v.optional(v.number()),
    // 未提出者への自動催促通知を実際に送信した時刻（UI表示・二重送信防止用）
    lastReminderSentAt: v.optional(v.number()),
    // シフト表の下書き保存時刻。保存後の希望表示優先順位判定に使う。
    // assignmentがない募集では未設定が正しいためoptionalを維持する。
    // TODO[narrow]: 全deploymentでm038が完走し、verifyRecruitmentsの
    // assignmentsWithoutDraftSavedAtが0件になった後はreader fallbackだけを削除する。
    draftSavedAt: v.optional(v.number()),
    // 確定・再送通知の最新semantic operation。optional wideningのため既存行のbackfillは不要。
    lastConfirmationNotificationOperationKey: v.optional(v.string()),
    // Date.nowに依存しない通知operation世代。semantic operationが変わった時だけ進める。
    lastConfirmationNotificationRunId: v.optional(v.number()),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_isDeleted", ["shopId", "isDeleted"])
    .index("by_shopId_and_isDeleted_and_periodStart", ["shopId", "isDeleted", "periodStart"])
    .index("by_shopId_and_isDeleted_and_periodEnd", ["shopId", "isDeleted", "periodEnd"])
    .index("by_shopId_and_isDeleted_and_status_and_periodStart", ["shopId", "isDeleted", "status", "periodStart"])
    .index("by_shopId_and_isDeleted_and_status_and_deadline", ["shopId", "isDeleted", "status", "deadline"])
    .index("by_shopId_and_isDeleted_and_status_and_periodEnd", ["shopId", "isDeleted", "status", "periodEnd"])
    .index("by_shopId_status", ["shopId", "status"])
    // 分析KPI: 日次窓（JST）で確定した募集のレンジスキャン用
    .index("by_status_and_confirmedAt", ["status", "confirmedAt"]),

  shiftSubmissionSlots: defineTable({
    submissionId: v.id("shiftSubmissions"),
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    date: v.string(), // "2026-01-20"
    startTime: v.string(), // "10:00"
    endTime: v.string(), // "18:00"
    optionId: v.optional(v.string()), // 勤務区分提出で選択された区分ID
  })
    .index("by_submissionId", ["submissionId"])
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_date", ["staffId", "date"]),

  shiftSubmissionDates: defineTable({
    submissionId: v.id("shiftSubmissions"),
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    date: v.string(), // "2026-01-20"
  })
    .index("by_submissionId", ["submissionId"])
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_date", ["staffId", "date"]),

  // ========================================
  // 確定シフト割当
  // ========================================
  shiftAssignments: defineTable(persistedShiftAssignmentValidator)
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_recruitmentId_date", ["recruitmentId", "date"])
    .index("by_staffId_and_date", ["staffId", "date"]),

  shiftConfirmationSnapshots: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    signature: v.string(),
    assignments: v.array(shiftConfirmationSnapshotAssignmentValidator),
    sentAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_recruitmentId", ["recruitmentId"]),

  // ========================================
  // シフト提出記録（全休み提出と未提出の区別用）
  // ========================================
  shiftSubmissions: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    // TODO[narrow]: 全deploymentでm033が完走し、verifyShiftSubmissionsの全pageが0になった後にrequired化する。
    firstSubmittedAt: v.optional(v.number()), // Unix ms（初回提出日時、既存データは submittedAt にフォールバック）
    submittedAt: v.number(), // Unix ms（最終提出日時）
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"]),

  recruitmentStats: defineTable({
    recruitmentId: v.id("recruitments"),
    shopId: v.id("shops"),
    submittedCount: v.number(),
    activeStaffCountSnapshot: v.number(),
    updatedAt: v.number(),
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_shopId", ["shopId"]),

  // ========================================
  // ポジション定義
  // ========================================
  positions: defineTable({
    shopId: v.id("shops"),
    name: v.string(),
    color: v.string(), // "#3b82f6"
    sortOrder: v.number(),
    // TODO[narrow]: 全deploymentでm034が完走し、verifyPositionsの全pageが0になった後にrequired化する。
    isDefault: v.optional(v.boolean()),
    isDeleted: v.boolean(),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_isDeleted", ["shopId", "isDeleted"]),

  // ========================================
  // マジックリンク認証
  // ========================================
  magicLinks: defineTable({
    token: v.string(), // UUID v4
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    // TODO[narrow]: 全deploymentでm035が完走し、verifyMagicLinksの全pageが0になった後にrequired化する。
    accessKind: v.optional(v.union(v.literal("submit"), v.literal("view"))),
    // resumable fanoutで同じbatchを再実行してもview capabilityを増やさないためのsemantic key。
    // fanout由来のview linkだけが持つ条件付きfieldで、submit linkは未設定が正しい。
    // 旧view linkには安全に導出できないため、期限内欠損をreadinessで確認して互換readerだけをNarrowする。
    notificationOperationKey: v.optional(v.string()),
    expiresAt: v.number(), // Unix ms（用途ごとの期限）
    usedAt: v.optional(v.number()), // 使用日時（ワンタイム制御）
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_recruitmentId_accessKind", ["staffId", "recruitmentId", "accessKind"])
    .index("by_staffId_recruitmentId_accessKind_notificationOperationKey", [
      "staffId",
      "recruitmentId",
      "accessKind",
      "notificationOperationKey",
    ])
    .index("by_shopId", ["shopId"])
    .index("by_expiresAt", ["expiresAt"]),

  // ========================================
  // スタッフセッション
  // ========================================
  sessions: defineTable({
    sessionToken: v.string(),
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    // TODO[narrow]: 全deploymentでm036が完走し、verifySessionsの全pageが0になった後にrequired化する。
    accessKind: v.optional(v.union(v.literal("submit"), v.literal("view"))),
    expiresAt: v.number(), // Unix ms（14日後）
    revokedAt: v.optional(v.number()),
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_recruitmentId", ["staffId", "recruitmentId"])
    .index("by_shopId", ["shopId"])
    .index("by_expiresAt", ["expiresAt"]),

  // ========================================
  // LINE 連携トークン（72h・ワンタイム）
  // OAuth 認可の state パラメータにそのまま使う
  // ========================================
  lineLinkTokens: defineTable({
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    // TODO[narrow]: canonical LINE切替と旧token drain完了後にrequired化する。
    organizationId: v.optional(v.id("organizations")),
    organizationPersonId: v.optional(v.id("organizationPeople")),
    lineLinkGenerationAtIssue: v.optional(v.number()),
    token: v.string(), // UUID v4
    expiresAt: v.number(), // 発行から72時間
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_and_expiresAt", ["staffId", "expiresAt"])
    .index("by_organizationPersonId_and_expiresAt", ["organizationPersonId", "expiresAt"])
    .index("by_shopId", ["shopId"])
    .index("by_expiresAt", ["expiresAt"]),

  // ========================================
  // LINE Quota 状態（単一レコード方針）
  // 通知送信時はDB値だけ読む。LINE API は cron で1日1回だけ叩く
  // ========================================
  lineQuotaStatus: defineTable({
    checkedAt: v.number(),
    totalQuota: v.number(),
    consumed: v.number(),
    remaining: v.number(),
    status: v.union(v.literal("normal"), v.literal("exceeded")),
    plan: v.union(v.literal("communication"), v.literal("light"), v.literal("standard")),
  }),

  // 募集・確定通知の対象集合と進捗。
  notificationFanoutOperations: defineTable({
    operationKey: v.string(),
    kind: notificationFanoutKindValidator,
    purpose: notificationFanoutPurposeValidator,
    recruitmentId: v.id("recruitments"),
    shopId: v.id("shops"),
    targetStaffIds: v.array(v.id("staffs")),
    cursor: v.number(),
    status: notificationFanoutStatusValidator,
    dedupeSuffix: v.string(),
    // TODO[narrow]: 全deploymentでm030が完走し、fanout readinessの欠損が0件になった後にrequired化する。
    // falseの個別再送は、同じ募集で進行中の全体fanoutを置き換えず並行して配る。
    // rollbackはmanual受付停止後、false operation/Outboxのdrain・cancelと欠落0確認までcompat reader/provider gateを維持する。
    // その確認後にだけbehaviorを戻し、optional field/indexは互換期間中そのまま残す。
    supersedesActiveOperations: v.optional(v.boolean()),
    // 個別再送受付時のbaseline。nullは値なし、undefinedは途中deploy等の不正rowとしてfail closedする。
    confirmationOperationKeyAtOrigin: v.optional(v.union(v.string(), v.null())),
    recruitmentDraftSavedAtAtOrigin: v.optional(v.union(v.number(), v.null())),
    organizationBillingVersionAtOrigin: v.optional(v.number()),
    notificationRunId: v.optional(v.number()),
    // pending actionのscheduler identity。cronが生存予約を重ねず、失敗済み予約だけを置き換える。
    // 予約前の短い区間とterminal operationでは未設定が正しいため、schema上はoptionalを維持する。
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(notificationFanoutCancelReasonValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operationKey", ["operationKey"])
    .index("by_recruitmentId_status", ["recruitmentId", "status"])
    .index("by_status_leaseExpiresAt", ["status", "leaseExpiresAt"]),

  notificationOutbox: defineTable({
    channel: notificationChannelValidator,
    status: notificationOutboxStatusValidator,
    dedupeKey: v.string(),
    // durable fanoutはchannelが変わってもoperation×staffを一つのprovider identityへ収束させる。
    // fanout以外のOutboxでは未設定が正しい条件付きfieldで、pairの片欠けだけをreadinessで拒否する。
    fanoutTargetKey: v.optional(v.string()),
    // provider呼び出し直前に最新semantic operationかを再照合する。fanout以外では未設定を維持する。
    fanoutOperationId: v.optional(v.id("notificationFanoutOperations")),
    // shopIdはbilling等のorganization-only通知では業務上optionalのまま維持する。
    shopId: v.optional(v.id("shops")),
    // TODO[narrow]: 全deploymentでm025/m037が完走し、verifyNotificationOutboxのscope異常と
    //   notificationOutbox所有の未解消conflictが0件になった後にrequired化する。
    organizationId: v.optional(v.id("organizations")),
    // enqueue時点のbilling versionであり、現在値から安全にbackfillできないためoptionalのまま維持する。
    organizationBillingVersionAtEnqueue: v.optional(v.number()),
    organizationInvitationId: v.optional(v.id("organizationInvitations")),
    organizationInvitationVersion: v.optional(v.number()),
    // TODO[narrow]: 全deploymentでm024_notification_outbox_narrow_prepが完走し、
    //   purpose / notificationContext / deliverySuppressedの欠損が0件であることを確認後、3 fieldをrequired化する。
    purpose: v.optional(notificationPurposeValidator),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    // canonical LINE recipientのenqueue時snapshot。LINE以外では未設定が正しい。
    organizationPersonLineLinkId: v.optional(v.id("organizationPersonLineLinks")),
    organizationPersonLineGenerationAtEnqueue: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    notificationContext: v.optional(v.string()),
    deliverySuppressed: v.optional(v.boolean()),
    payload: notificationPayloadValidator,
    attemptCount: v.number(),
    nextRunAt: v.number(),
    lastError: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    terminalAt: v.optional(v.number()),
    payloadRedactedAt: v.optional(v.number()),
    cancelReason: v.optional(notificationCancelReasonValidator),
    resendEmailId: v.optional(v.string()),
    resendLastEventType: v.optional(resendProviderIssueEventTypeValidator),
    resendLastEventAt: v.optional(v.number()),
    resendDeliveryStatus: v.optional(resendProviderDeliveryStatusValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dedupeKey_status", ["dedupeKey", "status"])
    .index("by_fanoutTargetKey", ["fanoutTargetKey"])
    .index("by_status_nextRunAt", ["status", "nextRunAt"])
    .index("by_status_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_status_processingStartedAt", ["status", "processingStartedAt"])
    .index("by_status_payloadRedactedAt_terminalAt", ["status", "payloadRedactedAt", "terminalAt"])
    .index("by_shopId_status", ["shopId", "status"])
    .index("by_organizationId_status", ["organizationId", "status"])
    .index("by_organizationId_purpose_status", ["organizationId", "purpose", "status"])
    .index("by_organizationInvitationId", ["organizationInvitationId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_staffId_status", ["staffId", "status"])
    .index("by_resendEmailId", ["resendEmailId"])
    // 分析KPI: 日次窓（JST）での送信/最終失敗のレンジスキャン用
    .index("by_status_sentAt", ["status", "sentAt"])
    .index("by_status_failedAt", ["status", "failedAt"])
    .index("by_recruitmentId_and_status_and_sentAt", ["recruitmentId", "status", "sentAt"])
    .index("by_recruitmentId_and_status_and_failedAt", ["recruitmentId", "status", "failedAt"]),

  // Resendの一時的なdelivery_delayedを、即時失敗へ昇格させず猶予するための運用状態。
  // 既存Outboxへ新規indexを追加せず、新規の空tableで期限順のbounded recoveryを成立させる。
  notificationResendDelayedFailureDeadlines: defineTable({
    outboxId: v.id("notificationOutbox"),
    dueAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_outboxId", ["outboxId"])
    .index("by_dueAt", ["dueAt"]),

  notificationHistory: defineTable({
    outboxId: v.id("notificationOutbox"),
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    channel: notificationChannelValidator,
    notificationKind: v.string(),
    displayTitle: v.string(),
    sendStatus: notificationHistorySendStatusValidator,
    deliveryStatus: notificationHistoryDeliveryStatusValidator,
    requestedAt: v.number(),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deliveryStatusAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_outboxId", ["outboxId"])
    .index("by_shopId_and_staffId_and_requestedAt", ["shopId", "staffId", "requestedAt"]),

  notificationDeliveryEvents: defineTable({
    eventType: notificationDeliveryEventTypeValidator,
    createdAt: v.number(),
    expiresAt: v.number(),
    shopId: v.optional(v.id("shops")),
    organizationId: v.optional(v.id("organizations")),
    organizationInvitationId: v.optional(v.id("organizationInvitations")),
    organizationInvitationVersion: v.optional(v.number()),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    outboxId: v.optional(v.id("notificationOutbox")),
    channel: v.optional(notificationChannelValidator),
    dedupeKey: v.optional(v.string()),
    notificationContext: v.optional(v.string()),
    attemptCount: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    provider: v.optional(v.literal("resend")),
    providerEventId: v.optional(v.string()),
    providerEmailId: v.optional(v.string()),
    providerEventType: v.optional(resendProviderEventTypeValidator),
    errorMessage: v.optional(v.string()),
    errorName: v.optional(v.string()),
  })
    .index("by_expiresAt", ["expiresAt"])
    .index("by_shopId_createdAt", ["shopId", "createdAt"])
    .index("by_organizationId_createdAt", ["organizationId", "createdAt"])
    .index("by_organizationInvitationId_createdAt", ["organizationInvitationId", "createdAt"])
    .index("by_outboxId_createdAt", ["outboxId", "createdAt"])
    .index("by_eventType_createdAt", ["eventType", "createdAt"])
    .index("by_providerEventId", ["providerEventId"]),

  notificationFailureInbox: defineTable({
    failureKey: v.string(),
    sourceType: notificationFailureInboxSourceTypeValidator,
    status: notificationFailureInboxStatusValidator,
    shopId: v.id("shops"),
    recruitmentId: v.optional(v.id("recruitments")),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    outboxId: v.optional(v.id("notificationOutbox")),
    channel: v.optional(notificationChannelValidator),
    dedupeKey: v.string(),
    notificationContext: v.string(),
    firstFailedAt: v.number(),
    lastFailedAt: v.number(),
    lastEventId: v.optional(v.id("notificationDeliveryEvents")),
    attemptCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    errorName: v.optional(v.string()),
    sensitiveDataRedactedAt: v.optional(v.number()),
    retryRequestedAt: v.optional(v.number()),
    retryRequestedByUserId: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id("users")),
    resolutionKind: v.optional(notificationFailureResolutionKindValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_failureKey", ["failureKey"])
    .index("by_status_firstFailedAt", ["status", "firstFailedAt"])
    .index("by_status_lastFailedAt", ["status", "lastFailedAt"])
    .index("by_shopId_status_lastFailedAt", ["shopId", "status", "lastFailedAt"])
    .index("by_outboxId", ["outboxId"])
    .index("by_staffId_status_lastFailedAt", ["staffId", "status", "lastFailedAt"])
    .index("by_sensitiveDataRedactedAt_lastFailedAt", ["sensitiveDataRedactedAt", "lastFailedAt"]),

  // ========================================
  // 店舗×月（JST）ごとの通知送信数。markSent 時にインクリメントする集約カウンタ
  // ========================================
  notificationUsage: defineTable({
    shopId: v.id("shops"),
    month: v.string(), // "YYYY-MM"（JST基準）
    emailCount: v.number(),
    lineCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shopId_month", ["shopId", "month"])
    .index("by_month", ["month"]),

  // ========================================
  // Analytics夜間batch
  // ========================================
  analyticsRuns: defineTable({
    runKey: v.string(),
    kind: analyticsRunKindValidator,
    status: analyticsRunStatusValidator,
    calculationVersion: v.number(),
    dataStartDate: v.string(),
    dataStartAt: v.number(),
    targetDate: v.optional(v.string()),
    inputFromAt: v.number(),
    cutoffAt: v.number(),
    sourceCaptureStartAt: v.optional(v.number()),
    resetWatermarkAt: v.optional(v.number()),
    stage: analyticsRunStageValidator,
    stepVersion: v.number(),
    startedAt: v.number(),
    terminalAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_runKey", ["runKey"])
    .index("by_kind_and_status_and_targetDate", ["kind", "status", "targetDate"])
    .index("by_status", ["status"])
    .index("by_status_and_terminalAt", ["status", "terminalAt"])
    .index("by_terminalAt", ["terminalAt"]),

  analyticsSourceEvents: defineTable({
    schemaVersion: v.number(),
    eventKey: v.string(),
    eventType: analyticsSourceEventTypeValidator,
    occurredAt: v.number(),
    organizationId: v.optional(v.id("organizations")),
    shopId: v.optional(v.id("shops")),
    recruitmentId: v.optional(v.id("recruitments")),
    subjectId: v.optional(v.union(v.id("organizationPeople"), v.id("organizationMembers"), v.id("staffs"))),
    payloadVersion: v.number(),
    payload: analyticsSourceEventPayloadValidator,
    createdAt: v.number(),
  })
    .index("by_eventKey", ["eventKey"])
    .index("by_occurredAt", ["occurredAt"])
    .index("by_organizationId_and_occurredAt", ["organizationId", "occurredAt"])
    .index("by_shopId_and_occurredAt", ["shopId", "occurredAt"]),

  analyticsOrganizations: defineTable({
    organizationId: v.id("organizations"),
    displayName: v.string(),
    registeredAt: v.number(),
    deletedAt: v.optional(v.number()),
    currentPlan: v.optional(analyticsPlanValidator),
    planEffectiveAt: v.optional(v.number()),
    firstShopId: v.optional(v.id("shops")),
    secondShopId: v.optional(v.id("shops")),
    firstShopAt: v.optional(v.number()),
    secondShopAt: v.optional(v.number()),
    secondShopFirstConfirmedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_registeredAt", ["registeredAt"])
    .index("by_deletedAt_and_registeredAt", ["deletedAt", "registeredAt"])
    .index("by_deletedAt_and_currentPlan_and_registeredAt", ["deletedAt", "currentPlan", "registeredAt"])
    .index("by_currentPlan", ["currentPlan"]),

  analyticsShops: defineTable({
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    displayName: v.string(),
    registeredAt: v.number(),
    deletedAt: v.optional(v.number()),
    currentPlan: v.optional(analyticsPlanValidator),
    planEffectiveAt: v.optional(v.number()),
    statusEffectiveAt: v.optional(v.number()),
    firstRecruitmentAt: v.optional(v.number()),
    firstSubmissionAt: v.optional(v.number()),
    firstConfirmedRecruitmentId: v.optional(v.id("recruitments")),
    secondConfirmedRecruitmentId: v.optional(v.id("recruitments")),
    firstConfirmedAt: v.optional(v.number()),
    secondConfirmedAt: v.optional(v.number()),
    latestActivityAt: v.optional(v.number()),
    estimatedCadenceDays: v.optional(v.number()),
    cadenceConfidence: v.union(v.literal("insufficientData"), v.literal("low"), v.literal("medium"), v.literal("high")),
    updatedAt: v.number(),
  })
    .index("by_shopId", ["shopId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_registeredAt", ["registeredAt"])
    .index("by_deletedAt_and_registeredAt", ["deletedAt", "registeredAt"])
    .index("by_deletedAt_and_currentPlan_and_registeredAt", ["deletedAt", "currentPlan", "registeredAt"])
    .index("by_deletedAt_and_latestActivityAt_and_registeredAt", ["deletedAt", "latestActivityAt", "registeredAt"])
    .index("by_organizationId_and_deletedAt_and_registeredAt", ["organizationId", "deletedAt", "registeredAt"])
    .index("by_organizationId_and_deletedAt_and_currentPlan_and_registeredAt", [
      "organizationId",
      "deletedAt",
      "currentPlan",
      "registeredAt",
    ])
    .index("by_organizationId_deletedAt_latestActivityAt_registeredAt", [
      "organizationId",
      "deletedAt",
      "latestActivityAt",
      "registeredAt",
    ])
    .index("by_currentPlan", ["currentPlan"])
    .index("by_latestActivityAt", ["latestActivityAt"]),

  analyticsPeople: defineTable({
    organizationId: v.id("organizations"),
    organizationPersonId: v.id("organizationPeople"),
    firstObservedAt: v.number(),
    deletedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_organizationPersonId", ["organizationPersonId"])
    .index("by_organizationId", ["organizationId"]),

  analyticsMemberships: defineTable(
    v.union(
      v.object({
        membershipKey: v.string(),
        organizationId: v.id("organizations"),
        organizationPersonId: v.id("organizationPeople"),
        role: v.literal("manager"),
        validFrom: v.number(),
        validTo: v.optional(v.number()),
        isShiftTarget: v.literal(false),
        lineLinked: v.literal(false),
        lineFollowing: v.literal(false),
        updatedAt: v.number(),
      }),
      v.object({
        membershipKey: v.string(),
        organizationId: v.id("organizations"),
        shopId: v.id("shops"),
        organizationPersonId: v.optional(v.id("organizationPeople")),
        staffId: v.id("staffs"),
        role: v.literal("staff"),
        validFrom: v.number(),
        validTo: v.optional(v.number()),
        isShiftTarget: v.boolean(),
        lineLinked: v.boolean(),
        lineFollowing: v.boolean(),
        updatedAt: v.number(),
      }),
    ),
  )
    .index("by_membershipKey_and_validFrom", ["membershipKey", "validFrom"])
    .index("by_organizationId_and_role_and_validFrom", ["organizationId", "role", "validFrom"])
    .index("by_shopId_and_role_and_validFrom", ["shopId", "role", "validFrom"])
    .index("by_shopId_and_organizationPersonId_and_validFrom", ["shopId", "organizationPersonId", "validFrom"])
    .index("by_organizationPersonId_and_validFrom", ["organizationPersonId", "validFrom"]),

  analyticsShiftCycles: defineTable({
    recruitmentId: v.id("recruitments"),
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    sequenceNumber: v.optional(v.number()),
    createdAt: v.number(),
    submitDeadlineAt: v.number(),
    periodStart: v.string(),
    periodEnd: v.string(),
    confirmedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    targetAtDeadline: v.optional(v.number()),
    submittedAtDeadline: v.optional(v.number()),
    targetAtClose: v.optional(v.number()),
    submittedAtClose: v.optional(v.number()),
    notificationSentCount: v.number(),
    notificationFailedCount: v.number(),
    lastNotificationFailedAt: v.optional(v.number()),
    reminderSentCount: v.number(),
    creationLeadTimeMs: v.optional(v.number()),
    confirmationLeadTimeMs: v.optional(v.number()),
    confirmationSlackMs: v.optional(v.number()),
    confirmedBeforeStart: v.optional(v.boolean()),
    completeness: analyticsCompletenessValidator,
    needsFinalizationAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_shopId_and_periodStart", ["shopId", "periodStart"])
    .index("by_shopId_and_deletedAt_and_periodStart", ["shopId", "deletedAt", "periodStart"])
    .index("by_shopId_and_deletedAt_and_completeness_and_periodStart", [
      "shopId",
      "deletedAt",
      "completeness",
      "periodStart",
    ])
    .index("by_shopId_and_completeness_and_confirmationLeadTimeMs", [
      "shopId",
      "completeness",
      "confirmationLeadTimeMs",
    ])
    .index("by_organizationId_and_periodStart", ["organizationId", "periodStart"])
    .index("by_periodStart", ["periodStart"])
    .index("by_completeness_and_periodStart", ["completeness", "periodStart"])
    .index("by_completeness_and_submitDeadlineAt", ["completeness", "submitDeadlineAt"])
    .index("by_needsFinalizationAt", ["needsFinalizationAt"]),

  analyticsShiftCycleOpportunities: defineTable({
    recruitmentId: v.id("recruitments"),
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    staffId: v.optional(v.id("staffs")),
    organizationPersonId: v.optional(v.id("organizationPeople")),
    targetedAtDeadline: v.boolean(),
    targetedAtClose: v.boolean(),
    firstSubmittedAt: v.optional(v.number()),
    lineLinkedAtCutoff: v.optional(v.boolean()),
    reminderCount: v.number(),
    completeness: analyticsCompletenessValidator,
    identityState: v.union(v.literal("active"), v.literal("redacted")),
    expiresAt: v.number(),
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_and_staffId", ["recruitmentId", "staffId"])
    .index("by_shopId_and_firstSubmittedAt", ["shopId", "firstSubmittedAt"])
    .index("by_identityState_and_expiresAt", ["identityState", "expiresAt"])
    .index("by_expiresAt", ["expiresAt"]),

  analyticsDailyServiceKpis: defineTable({
    runId: v.id("analyticsRuns"),
    snapshotDate: v.string(),
    organizationCount: v.number(),
    shopCount: v.number(),
    kpiEligibleShopCount: v.number(),
    activeShopCount: v.number(),
    personCount: v.number(),
    staffMembershipCount: v.number(),
    unlinkedStaffCount: v.number(),
    shiftTargetCount: v.number(),
    managerMembershipCount: v.number(),
    managerStaffCount: v.number(),
    milestoneCounts: analyticsMilestoneCountsValidator,
    healthSignalCounts: analyticsHealthSignalCountsValidator,
    northStar: analyticsRatePairValidator,
    deadlineSubmission: analyticsRatePairValidator,
    finalSubmission: analyticsRatePairValidator,
    completeness: analyticsCompletenessValidator,
    computedAt: v.number(),
  })
    .index("by_snapshotDate", ["snapshotDate"])
    .index("by_runId", ["runId"]),

  analyticsDailyNotificationKpis: defineTable({
    runId: v.id("analyticsRuns"),
    snapshotDate: v.string(),
    scope: v.union(v.literal("service"), v.literal("shop"), v.literal("recruitment")),
    scopeKey: v.string(),
    recruitmentId: v.optional(v.id("recruitments")),
    organizationId: v.optional(v.id("organizations")),
    shopId: v.optional(v.id("shops")),
    channel: notificationChannelValidator,
    kind: analyticsNotificationKindValidator,
    sentCount: v.number(),
    failedCount: v.number(),
    lastFailedAt: v.optional(v.number()),
    completeness: analyticsCompletenessValidator,
    computedAt: v.number(),
  })
    .index("by_snapshotDate", ["snapshotDate"])
    .index("by_runId", ["runId"])
    .index("by_shopId_and_snapshotDate", ["shopId", "snapshotDate"])
    .index("by_recruitmentId_and_snapshotDate", ["recruitmentId", "snapshotDate"])
    .index("by_runId_and_scopeKey_and_channel_and_kind", ["runId", "scopeKey", "channel", "kind"]),

  analyticsDailyOrganizationKpis: defineTable({
    runId: v.id("analyticsRuns"),
    organizationId: v.id("organizations"),
    snapshotDate: v.string(),
    currentPlan: v.optional(analyticsPlanValidator),
    shopCount: v.number(),
    kpiEligibleShopCount: v.number(),
    activeShopCount: v.number(),
    uniquePersonCount: v.number(),
    staffMembershipCount: v.number(),
    unlinkedStaffCount: v.number(),
    shiftTargetCount: v.number(),
    managerMembershipCount: v.number(),
    managerStaffCount: v.number(),
    milestoneCounts: analyticsMilestoneCountsValidator,
    healthSignalCounts: analyticsHealthSignalCountsValidator,
    northStar: analyticsRatePairValidator,
    deadlineSubmission: analyticsRatePairValidator,
    finalSubmission: analyticsRatePairValidator,
    completeness: analyticsCompletenessValidator,
    computedAt: v.number(),
  })
    .index("by_organizationId_and_snapshotDate", ["organizationId", "snapshotDate"])
    .index("by_snapshotDate", ["snapshotDate"])
    .index("by_runId", ["runId"]),

  analyticsDailyShopKpis: defineTable({
    runId: v.id("analyticsRuns"),
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    snapshotDate: v.string(),
    kpiEligible: v.boolean(),
    staffMembershipCount: v.number(),
    shiftTargetCount: v.number(),
    uniquePersonCount: v.number(),
    unlinkedStaffCount: v.number(),
    managerMembershipCount: v.number(),
    managerStaffCount: v.number(),
    lineLinkedCount: v.number(),
    lineFollowingCount: v.number(),
    hasRecentActivity: v.boolean(),
    cycleCount: v.number(),
    confirmedCycleCount: v.number(),
    confirmedBeforeStartCycleCount: v.number(),
    nextCyclePeriodStart: v.optional(v.string()),
    issueHealthSignalCount: v.number(),
    milestoneDates: analyticsMilestoneDatesValidator,
    healthSignals: v.array(analyticsHealthSignalStateValidator),
    cadence: analyticsCadenceValidator,
    northStar: analyticsRatePairValidator,
    deadlineSubmission: analyticsRatePairValidator,
    finalSubmission: analyticsRatePairValidator,
    cumulativeDeadlineSubmission: analyticsRatePairValidator,
    cumulativeFinalSubmission: analyticsRatePairValidator,
    cumulativeNotificationSentCount: v.number(),
    cumulativeNotificationFailedCount: v.number(),
    confirmationLeadTimeMedianMs: v.optional(v.number()),
    confirmationLeadTimeP90Ms: v.optional(v.number()),
    lastNotificationFailedAt: v.optional(v.number()),
    completeness: analyticsCompletenessValidator,
    computedAt: v.number(),
  })
    .index("by_shopId_and_snapshotDate", ["shopId", "snapshotDate"])
    .index("by_organizationId_and_snapshotDate", ["organizationId", "snapshotDate"])
    .index("by_snapshotDate", ["snapshotDate"])
    .index("by_snapshotDate_and_issueHealthSignalCount", ["snapshotDate", "issueHealthSignalCount"])
    .index("by_runId", ["runId"]),

  analyticsDailySegmentKpis: defineTable({
    runId: v.id("analyticsRuns"),
    snapshotDate: v.string(),
    dimension: analyticsSegmentDimensionValidator,
    bucket: v.string(),
    shopCount: v.number(),
    kpiEligibleShopCount: v.number(),
    milestoneCounts: analyticsMilestoneCountsValidator,
    healthSignalCounts: analyticsHealthSignalCountsValidator,
    northStar: analyticsRatePairValidator,
    deadlineSubmission: analyticsRatePairValidator,
    finalSubmission: analyticsRatePairValidator,
    completeness: analyticsCompletenessValidator,
    computedAt: v.number(),
  })
    .index("by_snapshotDate_and_dimension_and_bucket", ["snapshotDate", "dimension", "bucket"])
    .index("by_snapshotDate_and_completeness_and_dimension_and_bucket", [
      "snapshotDate",
      "completeness",
      "dimension",
      "bucket",
    ])
    .index("by_dimension_and_bucket_and_snapshotDate", ["dimension", "bucket", "snapshotDate"])
    .index("by_runId", ["runId"]),

  legalConsentTokens: defineTable({
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    token: v.string(),
    method: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"])
    .index("by_shopId", ["shopId"])
    .index("by_expiresAt", ["expiresAt"]),

  legalConsentEvents: defineTable({
    subjectType: v.union(v.literal("user"), v.literal("staff")),
    userId: v.optional(v.id("users")),
    staffId: v.optional(v.id("staffs")),
    shopId: v.id("shops"),
    termsConsentVersion: v.string(),
    privacyConsentVersion: v.string(),
    termsDocumentVersion: v.string(),
    privacyDocumentVersion: v.string(),
    consentedAt: v.number(),
    method: v.string(),
    sourceRecruitmentId: v.optional(v.id("recruitments")),
  })
    .index("by_userId", ["userId"])
    .index("by_staffId", ["staffId"])
    .index("by_shopId", ["shopId"]),
});

export default schema;

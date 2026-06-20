import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rateLimitTables } from "convex-helpers/server/rateLimit";
import { submissionPatternValidator } from "./_lib/submissionPattern";
import {
  notificationChannelValidator,
  notificationDeliveryEventTypeValidator,
  notificationFailureInboxSourceTypeValidator,
  notificationFailureInboxStatusValidator,
  notificationFailureResolutionKindValidator,
  notificationOutboxStatusValidator,
  notificationPayloadValidator,
} from "./notificationOutbox/schemas";

const schema = defineSchema({
  ...rateLimitTables,
  // ========================================
  // 店舗情報
  // ========================================
  shops: defineTable({
    name: v.string(),
    // submissionPattern 移行前の店舗時間帯。全環境で移行完了するまで optional で受ける。
    shiftStartTime: v.optional(v.string()),
    shiftEndTime: v.optional(v.string()),
    regularClosedDays: v.array(
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
    submissionPattern: v.optional(submissionPatternValidator),
    isDeleted: v.boolean(),
  }),

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
    email: v.string(),
    emailNormalized: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("manager")),
    isDeleted: v.boolean(),
    dashboardOnboardingDismissedAt: v.optional(v.number()),
  }).index("by_authTokenIdentifier", ["authTokenIdentifier"]),

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

  // ========================================
  // ダッシュボードお知らせ（全店舗共通）
  // ========================================
  dashboardAnnouncements: defineTable({
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
    name: v.string(),
    email: v.string(),
    emailNormalized: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    isDeleted: v.boolean(),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_isDeleted", ["shopId", "isDeleted"])
    .index("by_shopId_email_isDeleted", ["shopId", "email", "isDeleted"])
    .index("by_shopId_emailNormalized_isDeleted", ["shopId", "emailNormalized", "isDeleted"])
    .index("by_email", ["email"])
    .index("by_emailNormalized", ["emailNormalized"]),

  staffLineAccounts: defineTable({
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    lineUserId: v.string(),
    linkedAt: v.number(),
    following: v.boolean(),
    lastWebhookAt: v.optional(v.number()),
    isDeleted: v.boolean(),
  })
    .index("by_staffId", ["staffId"])
    .index("by_shopId_and_isDeleted", ["shopId", "isDeleted"])
    .index("by_lineUserId", ["lineUserId"])
    .index("by_lineUserId_and_isDeleted", ["lineUserId", "isDeleted"]),

  shopRegistrationLinks: defineTable({
    shopId: v.id("shops"),
    token: v.string(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_shopId", ["shopId"]),

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
    .index("by_status_and_createdAt", ["status", "createdAt"]),

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
    shopClosedDates: v.array(v.string()), // 募集期間内でお店を開けない日
    status: v.union(v.literal("open"), v.literal("confirmed")),
    confirmedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(),
    // submissionPattern 移行前の募集作成時点スナップショット。全環境で移行完了するまで optional で受ける。
    shiftStartTime: v.optional(v.string()),
    shiftEndTime: v.optional(v.string()),
    submissionPattern: v.optional(submissionPatternValidator),
    // 未提出者への自動催促通知を予約した時刻。既存募集には付与せず、作成時に未来時刻のものだけ保存する。
    reminderScheduledAt: v.optional(v.number()),
    // 未提出者への自動催促通知を実際に送信した時刻（UI表示・二重送信防止用）
    lastReminderSentAt: v.optional(v.number()),
    // シフト表の下書き保存時刻。保存後の希望表示優先順位判定に使う。
    draftSavedAt: v.optional(v.number()),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_isDeleted", ["shopId", "isDeleted"])
    .index("by_shopId_and_isDeleted_and_periodStart", ["shopId", "isDeleted", "periodStart"])
    .index("by_shopId_and_isDeleted_and_status_and_periodStart", ["shopId", "isDeleted", "status", "periodStart"])
    .index("by_shopId_and_isDeleted_and_status_and_deadline", ["shopId", "isDeleted", "status", "deadline"])
    .index("by_shopId_and_isDeleted_and_status_and_periodEnd", ["shopId", "isDeleted", "status", "periodEnd"])
    .index("by_shopId_status", ["shopId", "status"]),

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
  shiftAssignments: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    date: v.string(), // "2026-01-20"
    startTime: v.string(), // "10:00"
    endTime: v.string(), // "18:00"
    positionId: v.id("positions"),
    optionId: v.optional(v.string()), // 勤務区分募集で選択された区分ID
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_recruitmentId_date", ["recruitmentId", "date"]),

  shiftConfirmationSnapshots: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    signature: v.string(),
    assignments: v.array(
      v.object({
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
        positionId: v.id("positions"),
        optionId: v.optional(v.string()),
      }),
    ),
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
    accessKind: v.optional(v.union(v.literal("submit"), v.literal("view"))),
    expiresAt: v.number(), // Unix ms（用途ごとの期限）
    usedAt: v.optional(v.number()), // 使用日時（ワンタイム制御）
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_recruitmentId_accessKind", ["staffId", "recruitmentId", "accessKind"])
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
    token: v.string(), // UUID v4
    expiresAt: v.number(), // 発行から72時間
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"])
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

  notificationOutbox: defineTable({
    channel: notificationChannelValidator,
    status: notificationOutboxStatusValidator,
    dedupeKey: v.string(),
    shopId: v.id("shops"),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    payload: notificationPayloadValidator,
    attemptCount: v.number(),
    nextRunAt: v.number(),
    lastError: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_dedupeKey_status", ["dedupeKey", "status"])
    .index("by_status_nextRunAt", ["status", "nextRunAt"])
    .index("by_shopId_status", ["shopId", "status"]),

  notificationDeliveryEvents: defineTable({
    eventType: notificationDeliveryEventTypeValidator,
    createdAt: v.number(),
    expiresAt: v.number(),
    shopId: v.optional(v.id("shops")),
    staffId: v.optional(v.id("staffs")),
    userId: v.optional(v.id("users")),
    outboxId: v.optional(v.id("notificationOutbox")),
    channel: v.optional(notificationChannelValidator),
    dedupeKey: v.optional(v.string()),
    notificationContext: v.optional(v.string()),
    attemptCount: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    errorMessage: v.string(),
    errorName: v.optional(v.string()),
  })
    .index("by_expiresAt", ["expiresAt"])
    .index("by_shopId_createdAt", ["shopId", "createdAt"])
    .index("by_outboxId_createdAt", ["outboxId", "createdAt"])
    .index("by_eventType_createdAt", ["eventType", "createdAt"]),

  notificationFailureInbox: defineTable({
    failureKey: v.string(),
    sourceType: notificationFailureInboxSourceTypeValidator,
    status: notificationFailureInboxStatusValidator,
    shopId: v.id("shops"),
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
    lastError: v.string(),
    errorName: v.optional(v.string()),
    retryRequestedAt: v.optional(v.number()),
    retryRequestedByUserId: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id("users")),
    resolutionKind: v.optional(notificationFailureResolutionKindValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_failureKey", ["failureKey"])
    .index("by_shopId_status_lastFailedAt", ["shopId", "status", "lastFailedAt"])
    .index("by_outboxId", ["outboxId"])
    .index("by_staffId_status_lastFailedAt", ["staffId", "status", "lastFailedAt"]),

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

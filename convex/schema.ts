import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rateLimitTables } from "convex-helpers/server/rateLimit";

const schema = defineSchema({
  ...rateLimitTables,
  // ========================================
  // 店舗情報
  // ========================================
  shops: defineTable({
    name: v.string(),
    shiftStartTime: v.string(), // "14:00"
    shiftEndTime: v.string(), // "25:00" = 翌1:00
    ownerId: v.string(), // Clerk userId
    isDeleted: v.boolean(),
  }).index("by_ownerId", ["ownerId"]),

  // ========================================
  // 管理者ユーザー（Clerk認証）
  // ========================================
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("manager")),
    legalTermsConsentVersion: v.optional(v.string()),
    legalPrivacyConsentVersion: v.optional(v.string()),
    legalTermsDocumentVersion: v.optional(v.string()),
    legalPrivacyDocumentVersion: v.optional(v.string()),
    legalConsentedAt: v.optional(v.number()),
    legalConsentMethod: v.optional(v.string()),
    isDeleted: v.boolean(),
  }).index("by_clerkId", ["clerkId"]),

  // ========================================
  // スタッフ
  // ========================================
  staffs: defineTable({
    shopId: v.id("shops"),
    name: v.string(),
    email: v.string(),
    userId: v.optional(v.id("users")),
    legalTermsConsentVersion: v.optional(v.string()),
    legalPrivacyConsentVersion: v.optional(v.string()),
    legalTermsDocumentVersion: v.optional(v.string()),
    legalPrivacyDocumentVersion: v.optional(v.string()),
    legalConsentedAt: v.optional(v.number()),
    legalConsentMethod: v.optional(v.string()),
    isDeleted: v.boolean(),
    // LINE 連携
    lineUserId: v.optional(v.string()), // LINE プロフィール userId
    lineLinkedAt: v.optional(v.number()), // 連携完了時刻（Unix ms）
    lineFollowing: v.optional(v.boolean()), // 友達追加中フラグ（follow/unfollow Webhook で同期）
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_isDeleted", ["shopId", "isDeleted"])
    .index("by_shopId_email_isDeleted", ["shopId", "email", "isDeleted"])
    .index("by_email", ["email"])
    .index("by_lineUserId", ["lineUserId"]),

  // ========================================
  // シフト募集
  // ========================================
  recruitments: defineTable({
    shopId: v.id("shops"),
    periodStart: v.string(), // "2026-01-20"
    periodEnd: v.string(), // "2026-01-26"
    deadline: v.string(), // "2026-01-17"
    status: v.union(v.literal("open"), v.literal("confirmed")),
    confirmedAt: v.optional(v.number()), // Unix ms
    isDeleted: v.boolean(),
    // 募集作成時点の店舗シフト時間帯スナップショット
    // TODO[narrow]: Widen → Migrate → Narrow の 2 段階目。
    //   前提: develop/prod で m001_recruitments_add_shift_times が完走していること
    //   （確認: `pnpm convex:migrate:status` で state: done）
    //   対応: この 2 行の v.optional() を外して v.string() にし、
    //         convex/shiftBoard/queries.ts の `?? shop.xxx` フォールバックも削除する
    shiftStartTime: v.optional(v.string()), // "14:00"
    shiftEndTime: v.optional(v.string()), // "25:00" = 翌1:00
    // 未提出者への催促メール最終送信時刻（24時間クールダウン判定用）
    lastReminderSentAt: v.optional(v.number()),
  })
    .index("by_shopId", ["shopId"])
    .index("by_shopId_status", ["shopId", "status"]),

  // ========================================
  // スタッフの希望シフト
  // ========================================
  shiftRequests: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    date: v.string(), // "2026-01-20"
    startTime: v.string(), // "10:00"
    endTime: v.string(), // "18:00"
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_staffId", ["staffId"]),

  // ========================================
  // 確定シフト割当
  // ========================================
  shiftAssignments: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    date: v.string(), // "2026-01-20"
    startTime: v.string(), // "10:00"
    endTime: v.string(), // "18:00"
    positionId: v.optional(v.id("positions")), // Phase 5
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"])
    .index("by_recruitmentId_date", ["recruitmentId", "date"]),

  // ========================================
  // シフト提出記録（全休み提出と未提出の区別用）
  // ========================================
  shiftSubmissions: defineTable({
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
    submittedAt: v.number(), // Unix ms（最終提出日時）
  })
    .index("by_recruitmentId", ["recruitmentId"])
    .index("by_recruitmentId_staffId", ["recruitmentId", "staffId"]),

  // ========================================
  // ポジション定義（Phase 5、スキーマのみ）
  // ========================================
  positions: defineTable({
    shopId: v.id("shops"),
    name: v.string(),
    color: v.string(), // "#3b82f6"
    sortOrder: v.number(),
    isDeleted: v.boolean(),
  }).index("by_shopId", ["shopId"]),

  // ========================================
  // マジックリンク認証
  // ========================================
  magicLinks: defineTable({
    token: v.string(), // UUID v4
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    expiresAt: v.number(), // Unix ms（24時間後）
    usedAt: v.optional(v.number()), // 使用日時（ワンタイム制御）
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"]),

  // ========================================
  // スタッフセッション
  // ========================================
  sessions: defineTable({
    sessionToken: v.string(),
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    recruitmentId: v.id("recruitments"),
    expiresAt: v.number(), // Unix ms（14日後）
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_staffId", ["staffId"])
    .index("by_staffId_recruitmentId", ["staffId", "recruitmentId"]),

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
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"]),

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

  legalConsentTokens: defineTable({
    staffId: v.id("staffs"),
    shopId: v.id("shops"),
    token: v.string(),
    method: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_staffId", ["staffId"]),

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

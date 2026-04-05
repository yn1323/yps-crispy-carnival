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
    isDeleted: v.boolean(),
  })
    .index("by_shopId", ["shopId"])
    .index("by_email", ["email"]),

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
  // マネージャー招待（Phase 2、スキーマのみ）
  // ========================================
  invites: defineTable({
    shopId: v.id("shops"),
    email: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_token", ["token"]),
});

export default schema;

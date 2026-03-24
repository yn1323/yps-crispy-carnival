import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const users = defineTable({
  name: v.string(),
  email: v.string(),
  authId: v.optional(v.string()),
  status: v.string(), // "pending" | "active"
  createdAt: v.number(),
  isDeleted: v.optional(v.boolean()),
}).index("by_auth_id", ["authId"]);

const shops = defineTable({
  shopName: v.string(),
  openTime: v.string(),
  closeTime: v.string(),
  timeUnit: v.number(),
  submitFrequency: v.string(),
  avatar: v.optional(v.string()),
  description: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
  isDeleted: v.boolean(),
}).index("by_created_by", ["createdBy"]);

// スタッフテーブル（旧: shopUserBelongings）
// 管理者（Clerk認証）が登録するスタッフ情報
// スタッフはマジックリンクでアクセス（アカウント登録不要）
const staffs = defineTable({
  // 基本情報
  shopId: v.id("shops"),
  email: v.string(),
  displayName: v.string(),
  status: v.string(), // "pending" | "active" | "resigned"
  role: v.optional(v.string()), // "owner" | "manager" | "general" (undefinedはgeneral扱い)

  // ユーザー紐付け（マネージャー判定用）
  userId: v.optional(v.id("users")),

  // スキル・労働条件
  skills: v.optional(
    v.array(
      v.object({
        position: v.string(),
        level: v.string(),
      }),
    ),
  ),
  // 招待トークン（マネージャー招待用）
  inviteToken: v.optional(v.string()),
  inviteExpiresAt: v.optional(v.number()),

  // 管理情報
  invitedBy: v.optional(v.string()), // 招待した管理者のauthId
  resignedAt: v.optional(v.number()),
  resignationReason: v.optional(v.string()),

  // スタッフメモ（管理者用）
  memo: v.optional(v.string()),
  workStyleNote: v.optional(v.string()), // AIシフト作成用

  // メタ
  createdAt: v.number(),
  isDeleted: v.boolean(),
})
  .index("by_shop", ["shopId"])
  .index("by_email", ["email"])
  .index("by_shop_and_email", ["shopId", "email"])
  .index("by_invite_token", ["inviteToken"])
  .index("by_user", ["userId"]);

// 店舗のポジション定義（店舗ごとにカスタマイズ可能）
const shopPositions = defineTable({
  shopId: v.id("shops"),
  name: v.string(), // "ホール", "キッチン" など
  color: v.optional(v.string()), // "#3b82f6" など
  order: v.number(), // 表示順
  isDeleted: v.boolean(),
  createdAt: v.number(),
})
  .index("by_shop", ["shopId"])
  .index("by_shop_and_name", ["shopId", "name"]);

// スタッフのスキル（スタッフ × ポジション × レベル）
const staffSkills = defineTable({
  staffId: v.id("staffs"),
  positionId: v.id("shopPositions"),
  level: v.string(), // "未経験" | "研修中" | "一人前" | "ベテラン"
  updatedAt: v.number(),
})
  .index("by_staff", ["staffId"])
  .index("by_position", ["positionId"]);

// 必要人員設定（曜日ごと）
const requiredStaffing = defineTable({
  shopId: v.id("shops"),
  dayOfWeek: v.number(), // 0=日, 1=月, ..., 6=土
  staffing: v.array(
    v.object({
      hour: v.number(), // 0-23
      position: v.string(),
      requiredCount: v.number(),
    }),
  ),
  // ピーク帯定義（簡易入力モード）
  peakBands: v.optional(
    v.array(
      v.object({
        startTime: v.string(), // "11:00"
        endTime: v.string(), // "14:00"
        requiredCount: v.number(), // 必要人数
      }),
    ),
  ),
  // 最低人員（常時必要な最低人数）
  minimumStaff: v.optional(v.number()),
  // AI生成時の入力情報（作り直し用）
  aiInput: v.optional(
    v.object({
      shopType: v.string(),
      customerCount: v.string(),
    }),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_shop", ["shopId"]);

// シフト提出テーブル（スタッフがマジックリンクから提出）
const shiftRequests = defineTable({
  recruitmentId: v.id("recruitments"),
  staffId: v.id("staffs"),
  entries: v.array(
    v.object({
      date: v.string(), // "YYYY-MM-DD"
      isAvailable: v.boolean(),
      startTime: v.optional(v.string()), // "09:00"（isAvailable=true時）
      endTime: v.optional(v.string()), // "17:00"（isAvailable=true時）
    }),
  ),
  submittedAt: v.number(),
  updatedAt: v.optional(v.number()),
})
  .index("by_recruitment", ["recruitmentId"])
  .index("by_staff", ["staffId"])
  .index("by_recruitment_and_staff", ["recruitmentId", "staffId"]);

// シフト割当テーブル（管理者が編集・確定するシフト）
const shiftAssignments = defineTable({
  recruitmentId: v.id("recruitments"),
  assignments: v.array(
    v.object({
      staffId: v.string(),
      date: v.string(), // "YYYY-MM-DD"
      positions: v.array(
        v.object({
          positionId: v.string(),
          positionName: v.string(),
          color: v.string(),
          start: v.string(), // "09:00"
          end: v.string(), // "17:00"
        }),
      ),
    }),
  ),
  updatedAt: v.number(),
}).index("by_recruitment", ["recruitmentId"]);

// シフト募集テーブル
const recruitments = defineTable({
  shopId: v.id("shops"),
  startDate: v.string(), // YYYY-MM-DD
  endDate: v.string(), // YYYY-MM-DD
  deadline: v.string(), // YYYY-MM-DD
  status: v.string(), // "open" | "closed" | "confirmed"
  appliedCount: v.number(), // 申請済みスタッフ数（初期値: 0）
  totalStaffCount: v.number(), // 作成時のアクティブスタッフ数
  confirmedAt: v.optional(v.number()),
  createdBy: v.string(), // authId
  createdAt: v.number(),
  isDeleted: v.boolean(),
})
  .index("by_shop", ["shopId"])
  .index("by_shop_and_status", ["shopId", "status"])
  .index("by_shop_and_startDate", ["shopId", "startDate"]);

// マジックリンクテーブル（スタッフ × 募集単位でトークン管理）
const magicLinks = defineTable({
  staffId: v.id("staffs"),
  recruitmentId: v.id("recruitments"),
  token: v.string(),
  expiresAt: v.number(),
})
  .index("by_token", ["token"])
  .index("by_recruitment", ["recruitmentId"]);

const schema = defineSchema({
  users,
  shops,
  staffs,
  shopPositions,
  staffSkills,
  requiredStaffing,
  shiftRequests,
  shiftAssignments,
  recruitments,
  magicLinks,
});

// テーブル名を型安全にエクスポート（testing.tsで使用）
export const TABLE_NAMES = Object.keys(schema.tables) as (keyof typeof schema.tables)[];

export default schema;

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
  maxWeeklyHours: v.optional(v.number()),

  // マジックリンク（シフト申請サイクルごとに発行）
  magicLinkToken: v.optional(v.string()),
  magicLinkExpiresAt: v.optional(v.number()),

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
  hourlyWage: v.optional(v.number()),

  // メタ
  createdAt: v.number(),
  isDeleted: v.boolean(),
})
  .index("by_shop", ["shopId"])
  .index("by_email", ["email"])
  .index("by_shop_and_email", ["shopId", "email"])
  .index("by_magic_link_token", ["magicLinkToken"])
  .index("by_invite_token", ["inviteToken"])
  .index("by_user", ["userId"]);

const schema = defineSchema({
  users,
  shops,
  staffs,
});

export default schema;

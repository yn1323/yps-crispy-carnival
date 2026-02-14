/**
 * シフト提出ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - シフト希望の提出（新規/更新）
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { getStaffByMagicLinkToken, isValidTimeFormat } from "../helpers";

// シフト希望提出
export const submit = mutation({
  args: {
    token: v.string(),
    entries: v.array(
      v.object({
        date: v.string(),
        isAvailable: v.boolean(),
        startTime: v.optional(v.string()),
        endTime: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // トークンからスタッフを取得
    const staff = await getStaffByMagicLinkToken(ctx, args.token);
    if (!staff) {
      throw new ConvexError({ message: "無効なトークンです", code: "INVALID_TOKEN" });
    }

    // トークン有効期限チェック
    if (staff.magicLinkExpiresAt && staff.magicLinkExpiresAt < Date.now()) {
      throw new ConvexError({ message: "トークンの有効期限が切れています", code: "TOKEN_EXPIRED" });
    }

    // オープン中の募集を取得
    const recruitment = await ctx.db
      .query("recruitments")
      .withIndex("by_shop_and_status", (q) => q.eq("shopId", staff.shopId).eq("status", "open"))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first();

    if (!recruitment) {
      throw new ConvexError({ message: "募集が見つかりません", code: "NO_OPEN_RECRUITMENT" });
    }

    // エントリーのバリデーション
    for (const entry of args.entries) {
      if (entry.isAvailable) {
        if (!entry.startTime || !entry.endTime) {
          throw new ConvexError({
            message: `${entry.date}: 出勤可能な場合は開始・終了時刻が必要です`,
            code: "MISSING_TIME",
          });
        }
        if (!isValidTimeFormat(entry.startTime) || !isValidTimeFormat(entry.endTime)) {
          throw new ConvexError({
            message: `${entry.date}: 時刻の形式が不正です`,
            code: "INVALID_TIME_FORMAT",
          });
        }
        if (entry.startTime >= entry.endTime) {
          throw new ConvexError({
            message: `${entry.date}: 終了時刻は開始時刻より後にしてください`,
            code: "INVALID_TIME_RANGE",
          });
        }
      }
    }

    // 既存の提出データを確認
    const existingRequest = await ctx.db
      .query("shiftRequests")
      .withIndex("by_recruitment_and_staff", (q) => q.eq("recruitmentId", recruitment._id).eq("staffId", staff._id))
      .first();

    if (existingRequest) {
      // 更新
      await ctx.db.patch(existingRequest._id, {
        entries: args.entries,
        updatedAt: Date.now(),
      });
    } else {
      // 新規作成
      await ctx.db.insert("shiftRequests", {
        recruitmentId: recruitment._id,
        staffId: staff._id,
        entries: args.entries,
        submittedAt: Date.now(),
      });

      // 初回提出時のみ appliedCount をインクリメント
      await ctx.db.patch(recruitment._id, {
        appliedCount: recruitment.appliedCount + 1,
      });
    }

    return { success: true };
  },
});

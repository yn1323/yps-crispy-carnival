import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { generateUUID } from "../_lib/uuid";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * マジックリンクトークンを検証し、セッションを発行する
 * Clerk認証不要（スタッフのブラウザから直接呼ばれる）
 */
export const verifyToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const magicLink = await ctx.db
      .query("magicLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!magicLink || magicLink.expiresAt < Date.now() || magicLink.usedAt) {
      return {
        status: "expired" as const,
        recruitmentId: magicLink?.recruitmentId ?? null,
      };
    }

    // 既存の有効なセッションがあればそれを返す（usedAtは設定しない）
    const existingSessions = await ctx.db
      .query("sessions")
      .withIndex("by_staffId_recruitmentId", (q) =>
        q.eq("staffId", magicLink.staffId).eq("recruitmentId", magicLink.recruitmentId),
      )
      .collect();

    const validSession = existingSessions.find((s) => s.expiresAt > Date.now());

    if (validSession) {
      return {
        status: "ok" as const,
        sessionToken: validSession.sessionToken,
        recruitmentId: magicLink.recruitmentId,
      };
    }

    // 新規セッション作成 + トークン無効化
    const sessionToken = generateUUID();
    await ctx.db.insert("sessions", {
      sessionToken,
      staffId: magicLink.staffId,
      shopId: magicLink.shopId,
      recruitmentId: magicLink.recruitmentId,
      expiresAt: Date.now() + FOURTEEN_DAYS_MS,
    });
    await ctx.db.patch(magicLink._id, { usedAt: Date.now() });

    return {
      status: "ok" as const,
      sessionToken,
      recruitmentId: magicLink.recruitmentId,
    };
  },
});

/**
 * リンク再発行リクエスト
 * セキュリティ: 結果に関わらず一律voidを返す（メアド列挙攻撃防止）
 */
export const requestReissue = mutation({
  args: {
    email: v.string(),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { email, recruitmentId }) => {
    const staff = await ctx.db
      .query("staffs")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    const recruitment = await ctx.db.get(recruitmentId);

    if (
      !staff ||
      staff.isDeleted ||
      !recruitment ||
      recruitment.isDeleted ||
      recruitment.status !== "confirmed" ||
      staff.shopId !== recruitment.shopId
    ) {
      return;
    }

    await ctx.scheduler.runAfter(0, internal.email.actions.sendReissueEmail, {
      staffId: staff._id,
      recruitmentId,
    });
  },
});

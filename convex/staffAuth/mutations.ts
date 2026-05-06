import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { rateLimit } from "../_lib/rateLimits";
import { generateUUID } from "../_lib/uuid";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * マジックリンクトークンを検証し、セッションを発行する
 * Clerk認証不要（スタッフのブラウザから直接呼ばれる）
 */
export const verifyToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // レートリミットチェック（トークン先頭8文字をキーに）
    const { ok, retryAt } = await rateLimit(ctx, {
      name: "verifyToken",
      key: token.substring(0, 8),
    });
    if (!ok) {
      return {
        status: "rate_limited" as const,
        retryAfter: retryAt ?? Date.now() + 60_000,
        recruitmentId: null,
      };
    }

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

    // 既存の有効なセッションがあればそれを返す
    const existingSessions = await ctx.db
      .query("sessions")
      .withIndex("by_staffId_recruitmentId", (q) =>
        q.eq("staffId", magicLink.staffId).eq("recruitmentId", magicLink.recruitmentId),
      )
      .collect();

    const validSession = existingSessions.find((s) => s.expiresAt > Date.now());

    if (validSession) {
      await ctx.db.patch(magicLink._id, { usedAt: Date.now() });
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
 *
 * 内部ロギング: 早期リターンの理由をサーバーログに残し、配信不達の原因特定を可能にする。
 * フロントへのレスポンスはどの分岐でも void を維持する。
 * メールアドレスは生で残さず domain 部分のみログに含める（Dashboard 共有時の漏洩防止）。
 */
export const requestReissue = mutation({
  args: {
    email: v.string(),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { email, recruitmentId }) => {
    const emailDomain = email.split("@")[1];
    const logSkip = (reason: string, extra: Record<string, unknown> = {}) =>
      console.warn("[requestReissue] skip", { reason, recruitmentId, ...extra });

    // レートリミットチェック（email+recruitmentId をキーに）
    // メアド列挙攻撃防止: レートリミットでも成功時と同じレスポンス（void）を返す
    const { ok } = await rateLimit(ctx, {
      name: "requestReissue",
      key: `${email}:${recruitmentId}`,
    });
    if (!ok) return logSkip("rate_limited", { emailDomain });

    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment) return logSkip("recruitment_not_found");
    if (recruitment.isDeleted) return logSkip("recruitment_deleted");
    if (recruitment.status !== "confirmed") {
      return logSkip("recruitment_not_confirmed", { status: recruitment.status });
    }

    const staff = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_email_isDeleted", (q) =>
        q.eq("shopId", recruitment.shopId).eq("email", email).eq("isDeleted", false),
      )
      .first();
    if (!staff) return logSkip("staff_not_found", { emailDomain });

    const staffId = staff._id;

    await ctx.scheduler.runAfter(0, internal.email.actions.sendReissueEmail, { staffId, recruitmentId });
    console.log("[requestReissue] scheduled", { staffId, recruitmentId });
  },
});

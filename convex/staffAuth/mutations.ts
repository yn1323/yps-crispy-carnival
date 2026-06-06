import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { rateLimit } from "../_lib/rateLimits";
import {
  inferAccessKindFromRecruitmentStatus,
  recruitmentMatchesAccessKind,
  sessionMatchesAccessKind,
  staffAccessKindValidator,
} from "../_lib/staffAccess";
import { generateUUID } from "../_lib/uuid";
import { RATE_LIMIT_RETRY_FALLBACK_MS, STAFF_SESSION_TTL_MS } from "../constants";

/**
 * マジックリンクトークンを検証し、セッションを発行する
 * Clerk認証不要（スタッフのブラウザから直接呼ばれる）
 */
export const verifyToken = mutation({
  args: { token: v.string(), accessKind: staffAccessKindValidator },
  handler: async (ctx, { token, accessKind }) => {
    const now = Date.now();
    // レートリミットチェック（トークン先頭8文字をキーに）
    const { ok, retryAt } = await rateLimit(ctx, {
      name: "verifyToken",
      key: token.substring(0, 8),
    });
    if (!ok) {
      return {
        status: "rate_limited" as const,
        retryAfter: retryAt ?? now + RATE_LIMIT_RETRY_FALLBACK_MS,
        recruitmentId: null,
      };
    }

    const magicLink = await ctx.db
      .query("magicLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!magicLink || magicLink.revokedAt) {
      return {
        status: "expired" as const,
        recruitmentId: magicLink?.recruitmentId ?? null,
      };
    }

    const recruitment = await ctx.db.get(magicLink.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== magicLink.shopId) {
      return {
        status: "expired" as const,
        recruitmentId: magicLink.recruitmentId,
      };
    }

    const linkAccessKind = magicLink.accessKind ?? inferAccessKindFromRecruitmentStatus(recruitment.status);
    if (linkAccessKind !== accessKind || !recruitmentMatchesAccessKind(recruitment.status, accessKind)) {
      return {
        status: "expired" as const,
        recruitmentId: magicLink.recruitmentId,
      };
    }
    // submit リンクは「提出・修正は締切まで、閲覧は確定まで」なので、
    // 締切由来の magicLink.expiresAt では失効させない。提出可否は submitShiftRequests 側で判定する。
    if (accessKind === "view" && magicLink.expiresAt < now) {
      return {
        status: "expired" as const,
        recruitmentId: magicLink.recruitmentId,
      };
    }
    if (accessKind === "view" && magicLink.usedAt) {
      return {
        status: "expired" as const,
        recruitmentId: magicLink.recruitmentId,
      };
    }

    // 既存の有効なセッションがあればそれを返す
    const existingSessions = await ctx.db
      .query("sessions")
      .withIndex("by_staffId_recruitmentId", (q) =>
        q.eq("staffId", magicLink.staffId).eq("recruitmentId", magicLink.recruitmentId),
      )
      .collect();

    const validSession =
      accessKind === "view"
        ? existingSessions.find((s) => !s.revokedAt && s.expiresAt > now && sessionMatchesAccessKind(s, accessKind))
        : null;

    if (validSession) {
      if (accessKind === "view" && !magicLink.usedAt) {
        await ctx.db.patch(magicLink._id, { usedAt: now });
      }
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
      accessKind,
      expiresAt: now + STAFF_SESSION_TTL_MS,
    });
    if (accessKind === "view") {
      await ctx.db.patch(magicLink._id, { usedAt: now });
    }

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
    const normalizedEmail = email.trim().toLowerCase();
    const emailDomain = normalizedEmail.split("@")[1];
    const logSkip = (reason: string, extra: Record<string, unknown> = {}) =>
      console.warn("[requestReissue] skip", { reason, recruitmentId, ...extra });

    // レートリミットチェック（email+recruitmentId をキーに）
    // メアド列挙攻撃防止: レートリミットでも成功時と同じレスポンス（void）を返す
    const { ok } = await rateLimit(ctx, {
      name: "requestReissue",
      key: `${normalizedEmail}:${recruitmentId}`,
    });
    if (!ok) return logSkip("rate_limited", { emailDomain });
    const shortLimit = await rateLimit(ctx, {
      name: "requestReissueShort",
      key: `${normalizedEmail}:${recruitmentId}`,
    });
    if (!shortLimit.ok) return logSkip("duplicate_recent", { emailDomain });

    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment) return logSkip("recruitment_not_found");
    if (recruitment.isDeleted) return logSkip("recruitment_deleted");
    if (recruitment.status !== "confirmed") {
      return logSkip("recruitment_not_confirmed", { status: recruitment.status });
    }

    const staff = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
        q.eq("shopId", recruitment.shopId).eq("emailNormalized", normalizedEmail).eq("isDeleted", false),
      )
      .first();
    if (!staff) return logSkip("staff_not_found", { emailDomain });

    const staffId = staff._id;

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendReissueEmail, { staffId, recruitmentId });
    console.log("[requestReissue] scheduled", { staffId, recruitmentId });
  },
});

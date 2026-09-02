import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getSubmitLinkCutoff } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation, observedMutation as mutation } from "../_lib/errorObservability";
import { rateLimit } from "../_lib/rateLimits";
import { isShopAvailable } from "../_lib/shopAvailability";
import { recruitmentMatchesAccessKind, sessionMatchesAccessKind, staffAccessKindValidator } from "../_lib/staffAccess";
import { generateUUID } from "../_lib/uuid";
import { normalizeEmail } from "../_lib/validation";
import {
  RATE_LIMIT_RETRY_FALLBACK_MS,
  STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE,
  STAFF_SESSION_TTL_MS,
} from "../constants";
import { resolveCanonicalStaffScope } from "../line/service";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { isShiftTargetStaff } from "../staff/service";
import { reissueSchema } from "./schemas";

type ExpiredReason = "invalid_link" | "recruitment_deleted" | "submission_closed";

function expired(recruitmentId: Id<"recruitments"> | null, reason: ExpiredReason) {
  return {
    status: "expired" as const,
    reason,
    recruitmentId,
  };
}

/**
 * マジックリンクトークンを検証し、セッションを発行する
 * Clerk認証不要（スタッフのブラウザから直接呼ばれる）
 */
export const verifyToken = mutation({
  args: { token: v.string(), accessKind: staffAccessKindValidator },
  returns: v.union(
    v.object({
      status: v.literal("rate_limited"),
      retryAfter: v.number(),
      recruitmentId: v.null(),
    }),
    v.object({
      status: v.literal("expired"),
      reason: v.union(v.literal("invalid_link"), v.literal("recruitment_deleted"), v.literal("submission_closed")),
      recruitmentId: v.union(v.id("recruitments"), v.null()),
    }),
    v.object({
      status: v.literal("ok"),
      sessionToken: v.string(),
      recruitmentId: v.id("recruitments"),
    }),
  ),
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

    const magicLinks = await ctx.db
      .query("magicLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .take(2);

    if (magicLinks.length !== 1) {
      return expired(null, "invalid_link");
    }
    const magicLink = magicLinks[0];

    if (magicLink.revokedAt) {
      return expired(magicLink.recruitmentId, "invalid_link");
    }

    const [recruitment, staff, shop] = await Promise.all([
      ctx.db.get(magicLink.recruitmentId),
      ctx.db.get(magicLink.staffId),
      ctx.db.get(magicLink.shopId),
    ]);
    if (!recruitment || recruitment.shopId !== magicLink.shopId) {
      return expired(magicLink.recruitmentId, "invalid_link");
    }
    if (recruitment.isDeleted) {
      return expired(magicLink.recruitmentId, "recruitment_deleted");
    }
    // シフト対象外スタッフはマジックリンクからセッションを発行させない。
    const canonicalScope = staff
      ? await resolveCanonicalStaffScope(ctx, { staffId: staff._id, shopId: magicLink.shopId })
      : null;
    if (!staff || !isShiftTargetStaff(staff) || !canonicalScope || !(await isShopAvailable(ctx, shop))) {
      return expired(magicLink.recruitmentId, "invalid_link");
    }

    // TODO[narrow]: 全deploymentでm035が完走し、verifyMagicLinksの全pageが0になった後にmissing fallbackを削除する。
    // accessKind導入前のlinkはsubmit専用として扱い、確定後のview権限へ昇格させない。
    if ((magicLink.accessKind ?? "submit") !== accessKind) {
      return expired(magicLink.recruitmentId, "invalid_link");
    }
    if (!recruitmentMatchesAccessKind(recruitment.status, accessKind)) {
      return expired(
        magicLink.recruitmentId,
        accessKind === "submit" && recruitment.status === "confirmed" ? "submission_closed" : "invalid_link",
      );
    }
    // submit リンクは提出期限後の確認用にも使うが、シフト開始日以降は確定シフトリンクへ役割を渡す。
    if (accessKind === "submit" && now >= getSubmitLinkCutoff(recruitment.periodStart)) {
      return expired(magicLink.recruitmentId, "submission_closed");
    }
    // submit リンクは「提出・修正は提出期限まで、閲覧はシフト開始日前日まで」なので、
    // 提出期限由来の magicLink.expiresAt では失効させない。提出可否は submitShiftRequests 側で判定する。
    if (accessKind === "view" && magicLink.expiresAt < now) {
      return expired(magicLink.recruitmentId, "invalid_link");
    }
    if (accessKind === "view" && magicLink.usedAt) {
      return expired(magicLink.recruitmentId, "invalid_link");
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
    const expiresAt =
      accessKind === "submit"
        ? Math.min(now + STAFF_SESSION_TTL_MS, getSubmitLinkCutoff(recruitment.periodStart))
        : now + STAFF_SESSION_TTL_MS;
    const sessionId = await ctx.db.insert("sessions", {
      sessionToken,
      staffId: magicLink.staffId,
      shopId: magicLink.shopId,
      recruitmentId: magicLink.recruitmentId,
      accessKind,
      expiresAt,
    });
    // session作成と同じtransactionで期限処理を予約し、期限到来をDB writeとしてquery購読へ伝える。
    await ctx.scheduler.runAt(expiresAt, internal.staffAuth.mutations.expireSession, {
      sessionId,
      expectedExpiresAt: expiresAt,
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
 * 発行時に予約した時刻でsessionを物理削除する。
 * expectedExpiresAtを照合し、古い予約や重複実行が新しい状態を削除しないようにする。
 */
export const expireSession = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    expectedExpiresAt: v.number(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, { sessionId, expectedExpiresAt }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.expiresAt !== expectedExpiresAt || Date.now() < expectedExpiresAt) {
      return { changed: false };
    }
    await ctx.db.delete(sessionId);
    return { changed: true };
  },
});

/**
 * 導入前sessionや予約漏れを期限順のbounded batchで回収する。
 * batchが満杯なら即時継続を予約し、1分cronを待たずにbacklogを縮める。
 */
export const recoverExpiredSessions = internalMutation({
  args: {},
  returns: v.object({
    deletedCount: v.number(),
    continuationScheduled: v.boolean(),
  }),
  handler: async (ctx) => {
    const expiredSessions = await ctx.db
      .query("sessions")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE);

    for (const session of expiredSessions) {
      await ctx.db.delete(session._id);
    }

    const continuationScheduled = expiredSessions.length === STAFF_SESSION_EXPIRY_RECOVERY_BATCH_SIZE;
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(0, internal.staffAuth.mutations.recoverExpiredSessions, {});
    }
    return { deletedCount: expiredSessions.length, continuationScheduled };
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
  returns: v.null(),
  handler: async (ctx, { email, recruitmentId }) => {
    const logSkip = (reason: string, extra: Record<string, unknown> = {}) => {
      console.warn("[requestReissue] skip", { reason, recruitmentId, ...extra });
      return null;
    };
    const parsed = reissueSchema.safeParse({ email });
    if (!parsed.success) return logSkip("invalid_email");

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const emailDomain = normalizedEmail.split("@")[1];

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
    const shop = await ctx.db.get(recruitment.shopId);
    if (!(await isShopAvailable(ctx, shop))) return logSkip("shop_or_organization_deleted");

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
        q.eq("shopId", recruitment.shopId).eq("emailNormalized", normalizedEmail).eq("isDeleted", false),
      )
      .take(2);
    if (staffs.length === 0) return logSkip("staff_not_found", { emailDomain });
    if (staffs.length !== 1) return logSkip("staff_not_unique", { emailDomain });
    const staff = staffs[0];
    // シフト対象外スタッフには確定シフトの再発行リンクを送らない。
    if (!isShiftTargetStaff(staff)) return logSkip("staff_excluded", { emailDomain });
    const canonicalScope = await resolveCanonicalStaffScope(ctx, {
      staffId: staff._id,
      shopId: recruitment.shopId,
    });
    if (!canonicalScope) return logSkip("staff_canonical_identity_missing", { emailDomain });

    const staffId = staff._id;
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: recruitment.shopId });

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendReissueEmail, {
      staffId,
      recruitmentId,
      ...notificationOrigin,
    });
    console.log("[requestReissue] scheduled", { staffId, recruitmentId });
    return null;
  },
});

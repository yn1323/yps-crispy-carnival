import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isEmailSuppressed } from "../_lib/emailSuppression";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { normalizeEmail } from "../_lib/validation";
import {
  STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
  STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS,
  STAFF_REGISTRATION_VERIFICATION_MAX_SENDS,
  STAFF_REGISTRATION_VERIFICATION_PRUNE_BATCH_SIZE,
  STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
  STAFF_REGISTRATION_VERIFICATION_RETENTION_AFTER_EXPIRY_MS,
} from "../constants";
import { getLegalConsentVersions } from "../legal/documents";
import { resolveStaffRegistrationCapability } from "./capability";
import { createVerifiedRegistrationRequest } from "./mutations";
import { staffRegistrationFormSchema } from "./schemas";
import { staffRegistrationEmailRateLimitKey } from "./verificationCode";

type Verification = Doc<"staffRegistrationEmailVerifications">;

/**
 * 確認コードのメールをどこへ送るか。HTTP Actionがこの宛先へ送信する。
 * 配信停止の宛先ではnullにし、公開応答は変えずにメールだけを送らない。
 */
const deliveryValidator = v.union(
  v.null(),
  v.object({ to: v.string(), shopName: v.string(), idempotencyKey: v.string() }),
);
const sentResultValidator = v.object({
  status: v.literal("sent"),
  resendAvailableAt: v.number(),
  codeExpiresAt: v.number(),
  delivery: deliveryValidator,
});
const cooldownResultValidator = v.object({ status: v.literal("cooldown"), resendAvailableAt: v.number() });
const unavailableResultValidator = v.object({ status: v.literal("unavailable") });

/** 同じ店舗の同じメールアドレスへ、次に確認コードを送れる時刻。まだ送っていなければnull。 */
async function findResendAvailableAt(
  ctx: MutationCtx,
  target: { shopId: Id<"shops">; emailNormalized: string },
): Promise<number | null> {
  const latest = await ctx.db
    .query("staffRegistrationEmailVerifications")
    .withIndex("by_shopId_and_emailNormalized_and_lastSentAt", (q) =>
      q.eq("shopId", target.shopId).eq("emailNormalized", target.emailNormalized),
    )
    .order("desc")
    .first();
  return latest ? latest.lastSentAt + STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS : null;
}

async function findVerificationForShop(
  ctx: MutationCtx,
  input: { handleDigest: string; shopId: Id<"shops"> },
): Promise<Verification | null> {
  const verifications = await ctx.db
    .query("staffRegistrationEmailVerifications")
    .withIndex("by_handleDigest", (q) => q.eq("handleDigest", input.handleDigest))
    .take(2);
  // 別店舗の登録linkと組み合わせた引換tokenは、存在しない場合と同じ結果へ寄せる。
  if (verifications.length !== 1 || verifications[0].shopId !== input.shopId) return null;
  return verifications[0];
}

async function resolveDelivery(
  ctx: MutationCtx,
  input: {
    shop: Doc<"shops">;
    verificationId: Id<"staffRegistrationEmailVerifications">;
    sendCount: number;
    to: string;
  },
) {
  if (await isEmailSuppressed(ctx, input.to)) return null;
  return {
    to: input.to,
    shopName: input.shop.name,
    // 同じ送信の再試行でproviderが重複配送しないよう、確認待ちと送信回数から安定したkeyを作る。
    idempotencyKey: `staff-registration-verification-${input.verificationId}-${input.sendCount}`,
  };
}

/**
 * 参加申請の入力を確認待ちとして保存し、確認コードの送信先を返す。
 * 登録済み・申請済みのメールアドレスでも同じように送り、公開応答からメールアドレスの存在を読み取れないようにする。
 * 確認コードはHTTP Actionが作り、ここにはdigestだけを渡す。
 * 匿名クライアントからは直接呼ばせず、HTTP ActionでOrigin、body、Turnstile、rate limitを通した後だけ実行する。
 */
export const start = internalMutation({
  args: {
    token: v.string(),
    name: v.string(),
    email: v.string(),
    acceptedLegal: v.boolean(),
    handleDigest: v.string(),
    codeDigest: v.string(),
  },
  returns: v.union(sentResultValidator, cooldownResultValidator, unavailableResultValidator),
  handler: async (ctx, args) => {
    const parsed = staffRegistrationFormSchema.safeParse({
      name: args.name,
      email: args.email,
      acceptedLegal: args.acceptedLegal,
    });
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }

    const shop = await resolveStaffRegistrationCapability(ctx, args.token);
    if (!shop) return { status: "unavailable" as const };

    const emailNormalized = normalizeEmail(parsed.data.email);
    const now = Date.now();
    const resendAvailableAt = await findResendAvailableAt(ctx, { shopId: shop._id, emailNormalized });
    if (resendAvailableAt !== null && resendAvailableAt > now) {
      return { status: "cooldown" as const, resendAvailableAt };
    }

    const codeExpiresAt = now + STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS;
    const verificationId = await ctx.db.insert("staffRegistrationEmailVerifications", {
      shopId: shop._id,
      name: parsed.data.name,
      email: emailNormalized,
      emailNormalized,
      ...getLegalConsentVersions("staff"),
      handleDigest: args.handleDigest,
      codeDigest: args.codeDigest,
      codeExpiresAt,
      failedAttemptCount: 0,
      sendCount: 1,
      lastSentAt: now,
      createdAt: now,
    });

    return {
      status: "sent" as const,
      resendAvailableAt: now + STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
      codeExpiresAt,
      delivery: await resolveDelivery(ctx, { shop, verificationId, sendCount: 1, to: emailNormalized }),
    };
  },
});

/**
 * 確認コードを照合し、合えば参加申請を作って確認待ちを消す。
 * 失敗回数は確認待ちごとに数え、上限または期限切れのコードは再送するまで使えない。
 */
export const confirm = internalMutation({
  args: {
    token: v.string(),
    handleDigest: v.string(),
    codeDigest: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("verified"),
      v.literal("code_mismatch"),
      v.literal("code_unusable"),
      v.literal("unavailable"),
    ),
  }),
  handler: async (ctx, args) => {
    const shop = await resolveStaffRegistrationCapability(ctx, args.token);
    if (!shop) return { status: "unavailable" as const };

    const verification = await findVerificationForShop(ctx, { handleDigest: args.handleDigest, shopId: shop._id });
    const now = Date.now();
    if (
      !verification ||
      verification.codeExpiresAt <= now ||
      verification.failedAttemptCount >= STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS
    ) {
      return { status: "code_unusable" as const };
    }

    if (verification.codeDigest !== args.codeDigest) {
      const failedAttemptCount = verification.failedAttemptCount + 1;
      await ctx.db.patch(verification._id, { failedAttemptCount });
      return {
        status:
          failedAttemptCount >= STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS
            ? ("code_unusable" as const)
            : ("code_mismatch" as const),
      };
    }

    await createVerifiedRegistrationRequest(ctx, {
      shopId: shop._id,
      name: verification.name,
      emailNormalized: verification.emailNormalized,
      consentVersions: {
        termsConsentVersion: verification.termsConsentVersion,
        privacyConsentVersion: verification.privacyConsentVersion,
        termsDocumentVersion: verification.termsDocumentVersion,
        privacyDocumentVersion: verification.privacyDocumentVersion,
      },
      now,
    });
    await ctx.db.delete(verification._id);
    return { status: "verified" as const };
  },
});

/**
 * 確認コードを差し替えて同じ宛先へ送り直す。古いコードはその場で使えなくなる。
 * 送信間隔、1回の申請あたりの送信数、メールアドレスごとの1日の上限を、コードを差し替える前に確認する。
 * 新しいコードはHTTP Actionが作り、ここにはdigestだけを渡す。
 */
export const resend = internalMutation({
  args: {
    token: v.string(),
    handleDigest: v.string(),
    codeDigest: v.string(),
  },
  returns: v.union(
    sentResultValidator,
    cooldownResultValidator,
    unavailableResultValidator,
    v.object({ status: v.union(v.literal("verification_unusable"), v.literal("send_limit")) }),
  ),
  handler: async (ctx, args) => {
    const shop = await resolveStaffRegistrationCapability(ctx, args.token);
    if (!shop) return { status: "unavailable" as const };

    const verification = await findVerificationForShop(ctx, { handleDigest: args.handleDigest, shopId: shop._id });
    if (!verification) return { status: "verification_unusable" as const };
    if (verification.sendCount >= STAFF_REGISTRATION_VERIFICATION_MAX_SENDS) return { status: "send_limit" as const };

    const now = Date.now();
    const resendAvailableAt = await findResendAvailableAt(ctx, {
      shopId: shop._id,
      emailNormalized: verification.emailNormalized,
    });
    if (resendAvailableAt !== null && resendAvailableAt > now) {
      return { status: "cooldown" as const, resendAvailableAt };
    }

    // 再送でも、受付時と同じメールアドレス別の1日の上限を消費する。
    const dailyBudget = {
      name: "staffRegistrationEmailDaily" as const,
      key: await staffRegistrationEmailRateLimitKey(args.token, verification.emailNormalized),
    };
    if (!(await checkRateLimit(ctx, dailyBudget)).ok || !(await rateLimit(ctx, dailyBudget)).ok) {
      return { status: "send_limit" as const };
    }

    const codeExpiresAt = now + STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS;
    const sendCount = verification.sendCount + 1;
    await ctx.db.patch(verification._id, {
      codeDigest: args.codeDigest,
      codeExpiresAt,
      failedAttemptCount: 0,
      sendCount,
      lastSentAt: now,
    });

    return {
      status: "sent" as const,
      resendAvailableAt: now + STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
      codeExpiresAt,
      delivery: await resolveDelivery(ctx, {
        shop,
        verificationId: verification._id,
        sendCount,
        to: verification.emailNormalized,
      }),
    };
  },
});

/**
 * メールproviderへの送信に失敗したとき、届いていないコードのために次の送信を待たせない。
 * 初回の送信なら確認待ちごと消し、再送なら送信間隔だけを解除する。
 */
export const releaseFailedSend = internalMutation({
  args: { handleDigest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const verifications = await ctx.db
      .query("staffRegistrationEmailVerifications")
      .withIndex("by_handleDigest", (q) => q.eq("handleDigest", args.handleDigest))
      .take(2);
    if (verifications.length !== 1) return null;
    const verification = verifications[0];
    if (verification.sendCount <= 1) {
      await ctx.db.delete(verification._id);
      return null;
    }
    await ctx.db.patch(verification._id, {
      lastSentAt: Date.now() - STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
      // 届いていないコードは使えないままにする。
      codeExpiresAt: Date.now(),
    });
    return null;
  },
});

/** 確認コードの照合と再送の入口budget。確認待ちを引く前に、globalと信頼できる送信元IPで消費する。 */
export const checkIngressRateLimit = internalMutation({
  args: { ipKey: v.optional(v.string()) },
  returns: v.object({ allowed: v.boolean() }),
  handler: async (ctx, args) => {
    const budgets = [
      { name: "staffRegistrationVerificationGlobalShort" as const, key: "global" },
      ...(args.ipKey ? [{ name: "staffRegistrationVerificationIpShort" as const, key: args.ipKey }] : []),
    ];
    for (const budget of budgets) {
      const result = await checkRateLimit(ctx, budget);
      if (!result.ok) return { allowed: false };
    }
    for (const budget of budgets) {
      const result = await rateLimit(ctx, budget);
      if (!result.ok) return { allowed: false };
    }
    return { allowed: true };
  },
});

/** 確認が済まなかった名前とメールアドレスを、コードの期限切れから一定時間で削除する。 */
export const pruneExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - STAFF_REGISTRATION_VERIFICATION_RETENTION_AFTER_EXPIRY_MS;
    const expired = await ctx.db
      .query("staffRegistrationEmailVerifications")
      .withIndex("by_codeExpiresAt", (q) => q.lt("codeExpiresAt", cutoff))
      .take(STAFF_REGISTRATION_VERIFICATION_PRUNE_BATCH_SIZE);
    for (const verification of expired) {
      await ctx.db.delete(verification._id);
    }
    if (expired.length === STAFF_REGISTRATION_VERIFICATION_PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.staffRegistration.emailVerification.pruneExpired, {});
    }
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { authenticatedMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { normalizeEmail, requiredEmailSchema } from "../_lib/validation";
import { accountEmailPreflightSchema, accountEmailRequestSchema } from "./schemas";
import { assertAccountEmailAvailable, syncAccountEmail } from "./service";

export const preflight = authenticatedMutation({
  args: { email: v.string() },
  returns: v.object({ status: v.literal("ready") }),
  handler: async (ctx, args) => {
    if (!ctx.user || ctx.user.isDeleted || ctx.user.accountDeletionRequestedAt !== undefined) {
      throw new ConvexError("メールアドレスを変更できません。");
    }
    const parsed = accountEmailPreflightSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }
    const limit = await rateLimit(ctx, { name: "accountEmailPreflight", key: ctx.user._id });
    if (!limit.ok) {
      throw new ConvexError("操作回数が上限に達しました。少し時間をおいて、もう一度お試しください。");
    }
    await assertAccountEmailAvailable(ctx, ctx.user._id, normalizeEmail(parsed.data.email));
    return { status: "ready" as const };
  },
});

export const prepareSync = internalMutation({
  args: {
    authTokenIdentifier: v.string(),
    requestId: v.string(),
  },
  returns: v.union(
    v.object({ status: v.literal("ready"), requestKey: v.string() }),
    v.object({ status: v.literal("conflict") }),
    v.object({ status: v.literal("rateLimited") }),
  ),
  handler: async (ctx, args) => {
    const parsed = accountEmailRequestSchema.safeParse({ requestId: args.requestId });
    if (!parsed.success || args.authTokenIdentifier.length === 0 || args.authTokenIdentifier.length > 512) {
      return { status: "conflict" as const };
    }
    const users = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", args.authTokenIdentifier))
      .take(2);
    const user = users.length === 1 ? users[0] : null;
    if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
      return { status: "conflict" as const };
    }
    const limit = await rateLimit(ctx, { name: "accountEmailSync", key: user._id });
    if (!limit.ok) return { status: "rateLimited" as const };
    return { status: "ready" as const, requestKey: await toAuditRequestKey(parsed.data.requestId) };
  },
});

export const syncPrimary = internalMutation({
  args: {
    authTokenIdentifier: v.string(),
    email: v.string(),
    requestKey: v.string(),
  },
  returns: v.union(
    v.object({ status: v.literal("synced"), changed: v.boolean() }),
    v.object({ status: v.literal("conflict") }),
  ),
  handler: async (ctx, args) => {
    const parsed = requiredEmailSchema.safeParse(args.email);
    if (!parsed.success || !/^[a-f0-9]{64}$/.test(args.requestKey)) {
      return { status: "conflict" as const };
    }
    const users = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", args.authTokenIdentifier))
      .take(2);
    const user = users.length === 1 ? users[0] : null;
    if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
      return { status: "conflict" as const };
    }
    const result = await syncAccountEmail(ctx, {
      user,
      emailNormalized: normalizeEmail(parsed.data),
      requestKey: args.requestKey,
    });
    return { status: "synced" as const, changed: result.changed };
  },
});

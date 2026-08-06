import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { authenticatedMutation } from "../_lib/functions";

const RETIRED_MESSAGE =
  "このメールアドレス変更方法は終了しました。画面を再読み込みし、右上の「アカウント設定」をご利用ください。";

/**
 * Clerkを変更する前に旧clientを止める互換stub。
 */
export const preflight = authenticatedMutation({
  args: { email: v.string() },
  returns: v.object({ status: v.literal("ready") }),
  handler: async () => {
    throw new ConvexError(RETIRED_MESSAGE);
  },
});

/**
 * preflightを通過済みの旧clientも、Convexの全所属を変更させない。
 */
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
  handler: async () => ({ status: "conflict" as const }),
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
  handler: async () => ({ status: "conflict" as const }),
});

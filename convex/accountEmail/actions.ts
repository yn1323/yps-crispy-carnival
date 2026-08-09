import { v } from "convex/values";
import { action } from "../_generated/server";

const syncResultValidator = v.union(
  v.object({ status: v.literal("synced"), changed: v.boolean() }),
  v.object({ status: v.literal("conflict") }),
  v.object({ status: v.literal("rateLimited") }),
  v.object({ status: v.literal("unavailable"), retryable: v.boolean() }),
);

export type SyncMyPrimaryEmailResult =
  | { status: "synced"; changed: boolean }
  | { status: "conflict" }
  | { status: "rateLimited" }
  | { status: "unavailable"; retryable: boolean };

/**
 * 旧client互換の安全停止用stub。
 *
 * preflight後にClerkだけ変更済みのclientから呼ばれても、Convexの連絡先を
 * 全所属へ同期しない。新しいログイン方法はConvexのメールを変更しない。
 */
export const syncMyPrimaryEmail = action({
  args: { requestId: v.string() },
  returns: syncResultValidator,
  handler: async (): Promise<SyncMyPrimaryEmailResult> => ({
    status: "unavailable",
    retryable: false,
  }),
});

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { LINE_USER_ACTIVE_ACCOUNT_MAX } from "../constants";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function getStaffLineAccount(ctx: DbCtx, staffId: Id<"staffs">) {
  const account = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
    .first();
  return account && !account.isDeleted ? account : null;
}

export async function findStaffLineAccountByLineUserId(ctx: DbCtx, lineUserId: string) {
  const account = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .first();
  return account ?? null;
}

/**
 * 同じ lineUserId に紐づくアクティブなアカウントを、上限超過を判定できる1件分まで取得する。
 * 呼び出し側は上限超過時に更新前に停止し、部分反映してはならない。
 */
export async function findStaffLineAccountsByLineUserId(ctx: DbCtx, lineUserId: string) {
  return await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .take(LINE_USER_ACTIVE_ACCOUNT_MAX + 1);
}

export async function upsertStaffLineAccount(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    lineUserId: string;
    following: boolean;
  },
) {
  const existing = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
    .first();
  const now = Date.now();
  if (existing) {
    const lineUserChanged = existing.lineUserId !== args.lineUserId;
    await ctx.db.patch(existing._id, {
      shopId: args.shopId,
      lineUserId: args.lineUserId,
      linkedAt: existing.linkedAt,
      following: args.following,
      // 別LINE userへ付け替えた場合、旧userのWebhook順序を新userへ持ち越さない。
      ...(lineUserChanged
        ? {
            lastWebhookAt: undefined,
            lastWebhookEventId: undefined,
            lastWebhookEventTimestamp: undefined,
          }
        : {}),
      isDeleted: false,
    });
    return existing._id;
  }

  return await ctx.db.insert("staffLineAccounts", {
    staffId: args.staffId,
    shopId: args.shopId,
    lineUserId: args.lineUserId,
    linkedAt: now,
    following: args.following,
    isDeleted: false,
  });
}

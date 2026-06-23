import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

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
 * 同じ lineUserId に紐づくアクティブなアカウントを全件取得する。
 * 同一人物が複数店舗にLINE連携しているケース（店舗ごとに別 staff レコード）を扱う。
 */
export async function findStaffLineAccountsByLineUserId(ctx: DbCtx, lineUserId: string) {
  return await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", lineUserId).eq("isDeleted", false))
    .collect();
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
    await ctx.db.patch(existing._id, {
      shopId: args.shopId,
      lineUserId: args.lineUserId,
      linkedAt: existing.linkedAt,
      following: args.following,
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

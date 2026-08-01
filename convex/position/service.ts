import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_POSITION_COLOR, DEFAULT_POSITION_NAME } from "../constants";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function getDefaultPosition(ctx: DbCtx, shopId: Id<"shops">) {
  const positions = await ctx.db
    .query("positions")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(50);
  // TODO[narrow]: 全deploymentでm034が完走し、verifyPositionsの全pageが0になった後に先頭fallbackを削除する。
  return positions.find((position) => position.isDefault) ?? positions[0] ?? null;
}

export async function ensureDefaultPosition(ctx: MutationCtx, shopId: Id<"shops">) {
  const existing = await getDefaultPosition(ctx, shopId);
  if (existing) {
    // migration完走前に旧rowへ触れた場合も、現行readerが選んだpositionへ収束させる。
    if (existing.isDefault !== true) await ctx.db.patch(existing._id, { isDefault: true });
    return existing._id;
  }

  return await ctx.db.insert("positions", {
    shopId,
    name: DEFAULT_POSITION_NAME,
    color: DEFAULT_POSITION_COLOR,
    sortOrder: 0,
    isDefault: true,
    isDeleted: false,
  });
}

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_POSITION_COLOR, DEFAULT_POSITION_NAME } from "../constants";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function getDefaultPosition(ctx: DbCtx, shopId: Id<"shops">) {
  const positions = await ctx.db
    .query("positions")
    .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
    .take(50);
  return positions.find((position) => position.isDefault) ?? positions[0] ?? null;
}

export async function ensureDefaultPosition(ctx: MutationCtx, shopId: Id<"shops">) {
  const existing = await getDefaultPosition(ctx, shopId);
  if (existing) return existing._id;

  return await ctx.db.insert("positions", {
    shopId,
    name: DEFAULT_POSITION_NAME,
    color: DEFAULT_POSITION_COLOR,
    sortOrder: 0,
    isDefault: true,
    isDeleted: false,
  });
}

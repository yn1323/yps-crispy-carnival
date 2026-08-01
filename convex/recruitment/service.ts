import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function getActiveRecruitmentInShop(ctx: DbCtx, shopId: Id<"shops">, recruitmentId: Id<"recruitments">) {
  const recruitment = await ctx.db.get(recruitmentId);
  return recruitment && recruitment.shopId === shopId && !recruitment.isDeleted ? recruitment : null;
}

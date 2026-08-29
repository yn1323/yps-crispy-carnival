import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";

/** 店舗本体と任意の親組織がともに未削除かを、公開/capability境界で再確認する。 */
export async function isShopAvailable(ctx: { db: GenericDatabaseReader<DataModel> }, shop: Doc<"shops"> | null) {
  if (!shop || shop.isDeleted) return false;
  if (!shop.organizationId) return true;
  const organization = await ctx.db.get(shop.organizationId);
  return Boolean(organization && !organization.isDeleted);
}

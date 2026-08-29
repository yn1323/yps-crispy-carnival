import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";

type StaffRegistrationCapabilityCtx = {
  db: GenericDatabaseReader<DataModel>;
};

/**
 * 匿名登録tokenが現在も申請作成に使える店舗を解決する。
 * 失敗理由は公開境界へ出さず、callerが同一のunavailable応答へ畳み込む。
 */
export async function resolveStaffRegistrationCapability(
  ctx: StaffRegistrationCapabilityCtx,
  token: string,
): Promise<Doc<"shops"> | null> {
  const links = await ctx.db
    .query("shopRegistrationLinks")
    .withIndex("by_token", (q) => q.eq("token", token))
    .take(2);
  if (links.length !== 1 || links[0].revokedAt) return null;

  const shop = await ctx.db.get(links[0].shopId);
  if (!shop || shop.isDeleted) return null;

  if (shop.organizationId) {
    const [organization, accessPolicy] = await Promise.all([
      ctx.db.get(shop.organizationId),
      getOrganizationAccessPolicy(ctx, shop.organizationId),
    ]);
    if (!organization || organization.isDeleted || (accessPolicy !== null && accessPolicy.accessMode !== "normal")) {
      return null;
    }
  }

  return shop;
}

import type { GenericDatabaseReader } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";

export const BILLING_PLANS = {
  free: {
    planLabel: "フリー",
    canUsePaidFeatures: false,
    maxStaffCount: 10,
  },
  standard: {
    planLabel: "スタンダード",
    canUsePaidFeatures: true,
    maxStaffCount: 20,
  },
  premium: {
    planLabel: "プレミアム",
    canUsePaidFeatures: true,
    maxStaffCount: 30,
  },
} as const;

export type BillingPlanKey = keyof typeof BILLING_PLANS;
export type BillingSource = "system" | "manual";

export type ShopBillingState = {
  shopId: Id<"shops">;
  planKey: BillingPlanKey;
  source: BillingSource;
  createdAt: number | null;
  updatedAt: number | null;
};

export type ShopEntitlements = {
  planKey: BillingPlanKey;
  planLabel: (typeof BILLING_PLANS)[BillingPlanKey]["planLabel"];
  canUsePaidFeatures: boolean;
  maxStaffCount: number;
  isStaffLimitEnforced: false;
};

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export async function getShopBillingState(ctx: DbCtx, shopId: Id<"shops">): Promise<ShopBillingState> {
  const state = await ctx.db
    .query("shopBillingStates")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .unique();
  if (state) {
    return {
      shopId,
      planKey: state.planKey,
      source: state.source,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  return {
    shopId,
    planKey: "free",
    source: "system",
    createdAt: null,
    updatedAt: null,
  };
}

export async function getShopEntitlements(ctx: DbCtx, shopId: Id<"shops">): Promise<ShopEntitlements> {
  const state = await getShopBillingState(ctx, shopId);
  const plan = BILLING_PLANS[state.planKey];

  return {
    planKey: state.planKey,
    planLabel: plan.planLabel,
    canUsePaidFeatures: plan.canUsePaidFeatures,
    maxStaffCount: plan.maxStaffCount,
    // 課金機能公開前は既存店舗の人数を制限しない。上限値は料金設計のメタデータとしてだけ返す。
    isStaffLimitEnforced: false,
  };
}

export async function requirePaidFeature(ctx: DbCtx, shopId: Id<"shops">): Promise<ShopEntitlements> {
  const entitlements = await getShopEntitlements(ctx, shopId);
  if (!entitlements.canUsePaidFeatures) {
    throw new ConvexError("この機能は有料プランで利用できます");
  }
  return entitlements;
}

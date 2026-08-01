import type { GenericDatabaseReader } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";
import { getOrganizationBillingState, getOrganizationUsageSnapshot } from "../organization/service";
import {
  deriveOrganizationBillingPolicy,
  evaluatePlanLimits,
  getEffectiveRestrictedBillingState,
  type RecoveryCapability,
} from "./policy";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export async function getOrganizationBillingPolicy(ctx: DbCtx, organizationId: Id<"organizations">) {
  const billingState = await getOrganizationBillingState(ctx, organizationId);
  return billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
}

/**
 * 通常の店舗業務mutationから呼ぶ。
 * TODO[narrow]: 全deploymentでm025完走・verifyOrganizationsのbilling state残件0確認後、state欠損を拒否する。
 */
export async function requireOrganizationBusinessWrite(ctx: DbCtx, organizationId: Id<"organizations">) {
  const policy = await getOrganizationBillingPolicy(ctx, organizationId);
  if (!policy) return null;
  if (!policy.canWriteBusinessData) {
    throw new ConvexError(
      policy.businessWriteBlockReason === "paymentResultPending"
        ? "支払い結果を確認中のため、業務操作はまだ利用できません。"
        : "契約状態を確認できるまで、閲覧と復旧に必要な操作のみ利用できます。",
    );
  }
  return policy;
}

export async function requireOrganizationPaidFeature(ctx: DbCtx, organizationId: Id<"organizations">) {
  const policy = await getOrganizationBillingPolicy(ctx, organizationId);
  if (!policy?.canUsePaidFeatures) {
    throw new ConvexError(
      policy?.paidFeatureBlockReason === "paymentResultPending"
        ? "支払い結果が確定すると利用できます。"
        : "この機能はトライアルまたはProで利用できます。",
    );
  }
  return policy;
}

export async function requireOrganizationCapacity(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    additionalPeople?: number;
    additionalActiveShops?: number;
    additionalActiveManagers?: number;
    excludedInvitationId?: Id<"organizationInvitations">;
  },
) {
  const billingState = await getOrganizationBillingState(ctx, args.organizationId);
  if (!billingState) {
    throw new ConvexError("グループの契約情報を確認中のため、この追加操作はまだ利用できません。");
  }
  const policy = deriveOrganizationBillingPolicy(billingState.state);
  if (!policy.entitlementPlan || !policy.limits || !policy.canWriteBusinessData) {
    throw new ConvexError("現在の契約状態では、この追加操作を行えません。");
  }

  const usage = await getOrganizationUsageSnapshot(ctx, args.organizationId, Date.now(), {
    excludedInvitationId: args.excludedInvitationId,
  });
  const projectedUsage = {
    peopleCount: usage.projectedPersonCount + (args.additionalPeople ?? 0),
    activeShopCount: usage.activeShopCount + (args.additionalActiveShops ?? 0),
    activeManagerCount: usage.projectedActiveManagerCount + (args.additionalActiveManagers ?? 0),
  };
  const evaluation = evaluatePlanLimits(policy.entitlementPlan, projectedUsage);
  if (!evaluation.withinLimits) {
    const message = evaluation.violations.includes("people")
      ? `利用人数が現在のプラン上限を超えます。\n現在${usage.projectedPersonCount}名、上限${policy.limits.maxPeople}名です。`
      : evaluation.violations.includes("activeShops")
        ? "店舗数が現在のプラン上限を超えます。"
        : "招待中を含めた管理者の合計が、現在のプラン上限を超えます。";
    throw new ConvexError(message);
  }
  return { billingState, policy, usage };
}

export async function requireRestrictedRecoveryCapability(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    capability: RecoveryCapability;
  },
) {
  const billingState = await getOrganizationBillingState(ctx, args.organizationId);
  const restrictedState = billingState ? getEffectiveRestrictedBillingState(billingState.state) : null;
  if (!billingState || !restrictedState) {
    throw new ConvexError("契約制限中の復旧操作ではありません");
  }
  const isRecoveryManager = restrictedState.recoveryManagerPersonIds.some((personId) => personId === args.personId);
  const policy = deriveOrganizationBillingPolicy(billingState.state);
  if (!isRecoveryManager || !policy.allowedRecoveryCapabilities.includes(args.capability)) {
    throw new ConvexError("この復旧操作を行う権限がありません");
  }
  return { billingState, policy };
}

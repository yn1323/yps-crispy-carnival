import type { GenericDatabaseReader } from "convex/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";
import {
  getOrganizationActualUsageProbe,
  getOrganizationBillingState,
  getOrganizationUsageSnapshot,
  isValidOrganizationActiveManager,
} from "../organization/service";
import { organizationPaidPlanLabel } from "./planPresentation";
import {
  deriveOrganizationAccessPolicy,
  deriveOrganizationBillingPolicy,
  evaluateOrganizationUsageLimits,
  evaluatePlanLimits,
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationAccessPolicy,
  resolveUsageLimitPlan,
} from "./policy";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export async function getOrganizationBillingPolicy(ctx: DbCtx, organizationId: Id<"organizations">) {
  const billingState = await getOrganizationBillingState(ctx, organizationId);
  return billingState ? deriveOrganizationBillingPolicy(billingState.state) : null;
}

export async function getOrganizationAccessPolicy(ctx: DbCtx, organizationId: Id<"organizations">) {
  const billingState = await getOrganizationBillingState(ctx, organizationId);
  if (!billingState) return null;

  const billingPolicy = deriveOrganizationBillingPolicy(billingState.state);
  const usagePlan = billingPolicy.canWriteBusinessData ? resolveUsageLimitPlan(billingState.state) : null;
  const usageProbe = usagePlan
    ? await getOrganizationActualUsageProbe(ctx, organizationId, ORGANIZATION_PLAN_LIMITS[usagePlan])
    : null;
  let usageLimitStatus: OrganizationAccessPolicy["usageLimitStatus"] = null;
  if (usagePlan && usageProbe) {
    const evaluation = evaluateOrganizationUsageLimits({ plan: usagePlan, usage: usageProbe.usage });
    if (evaluation.kind === "overLimit") {
      usageLimitStatus = {
        ...evaluation,
        violations: evaluation.violations.map((violation) =>
          usageProbe.lowerBoundDimensions.includes(violation.kind)
            ? { ...violation, isLowerBound: true as const }
            : violation,
        ),
        ...(usageProbe.unknownDimensions.length > 0 ? { unknownDimensions: usageProbe.unknownDimensions } : {}),
      };
    } else if (usageProbe.unknownDimensions.length > 0) {
      usageLimitStatus = {
        kind: "unknown",
        evaluatedPlan: usagePlan,
        observedUsage: usageProbe.usage,
        limits: ORGANIZATION_PLAN_LIMITS[usagePlan],
        unknownDimensions: usageProbe.unknownDimensions,
        knownViolations: [],
      };
    } else {
      usageLimitStatus = evaluation;
    }
  }
  const accessPolicy = deriveOrganizationAccessPolicy({ billingPolicy, usageLimitStatus });
  return { billingState, usageProbe, ...accessPolicy };
}

export const LIMIT_RECOVERY_CAPABILITIES = [
  "removeOrganizationPerson",
  "removeManagerRole",
  "deleteShop",
  "cancelManagerInvitation",
  "rejectStaffRegistrationRequest",
  "resolveNotificationFailure",
  "startOrUpgradePaidPlan",
  "updateBillingEmail",
  "deleteOrganization",
] as const;

export type LimitRecoveryCapability = (typeof LIMIT_RECOVERY_CAPABILITIES)[number];

function usageLimitExceededError(access: OrganizationAccessPolicy) {
  if (access.usageLimitStatus?.kind === "unknown") {
    return new ConvexError({
      code: "USAGE_LIMIT_EVALUATION_UNAVAILABLE" as const,
      message:
        "現在の利用数を安全に確認できないため、通常の業務操作を一時的に制限しています。利用人数・店舗・管理者を整理するか、プランを変更してください。",
      plan: access.usageLimitStatus.evaluatedPlan,
      unknownDimensions: access.usageLimitStatus.unknownDimensions,
    });
  }
  if (access.usageLimitStatus?.kind !== "overLimit") {
    return new ConvexError("現在の利用状態では、通常の業務操作を行えません。");
  }
  return new ConvexError({
    code: "USAGE_LIMIT_EXCEEDED" as const,
    message: "現在のプラン上限を超えているため、利用人数・店舗・管理者を整理するか、プランを変更してください。",
    plan: access.usageLimitStatus.evaluatedPlan,
    violations: access.usageLimitStatus.violations,
  });
}

function requireBusinessWriteFromAccess(access: Awaited<ReturnType<typeof getOrganizationAccessPolicy>>) {
  if (!access) {
    throw new ConvexError("組織の契約情報を確認できません。");
  }
  if (access.accessMode === "normal") return access.billingPolicy;
  throw usageLimitExceededError(access);
}

/** 通常の店舗業務mutationから呼ぶ。 */
export async function requireOrganizationBusinessWrite(ctx: DbCtx, organizationId: Id<"organizations">) {
  return requireBusinessWriteFromAccess(await getOrganizationAccessPolicy(ctx, organizationId));
}

export async function requireOrganizationLimitRecoveryCapability(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    capability: LimitRecoveryCapability;
  },
) {
  const access = await getOrganizationAccessPolicy(ctx, args.organizationId);
  if (
    access?.accessMode !== "limitRecoveryOnly" ||
    !LIMIT_RECOVERY_CAPABILITIES.includes(args.capability) ||
    !(await isValidOrganizationActiveManager(ctx, args.organizationId, args.personId))
  ) {
    throw new ConvexError("この整理操作を行う権限がありません");
  }
  return access;
}

export async function requireOrganizationBusinessWriteOrLimitRecoveryCapability(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    capability: LimitRecoveryCapability;
  },
) {
  const access = await getOrganizationAccessPolicy(ctx, args.organizationId);
  if (access?.accessMode !== "limitRecoveryOnly") {
    return requireBusinessWriteFromAccess(access);
  }
  if (
    !LIMIT_RECOVERY_CAPABILITIES.includes(args.capability) ||
    !(await isValidOrganizationActiveManager(ctx, args.organizationId, args.personId))
  ) {
    throw new ConvexError("この整理操作を行う権限がありません");
  }
  return access.billingPolicy;
}

export async function requireOrganizationPaidFeature(ctx: DbCtx, organizationId: Id<"organizations">) {
  const policy = await getOrganizationBillingPolicy(ctx, organizationId);
  if (!policy?.canUsePaidFeatures) {
    throw new ConvexError(
      policy?.paidFeatureBlockReason === "paymentResultPending"
        ? "支払い結果が確定すると利用できます。"
        : `この機能はトライアルまたは${organizationPaidPlanLabel("standard")}で利用できます。`,
    );
  }
  return policy;
}

export async function requireOrganizationCapacity(
  ctx: DbCtx,
  args: {
    organizationId: Id<"organizations">;
    additionalPeople?: number;
    additionalShops?: number;
    additionalActiveManagers?: number;
    excludedInvitationId?: Id<"organizationInvitations">;
  },
) {
  const billingState = await getOrganizationBillingState(ctx, args.organizationId);
  if (!billingState) {
    throw new ConvexError("組織の契約情報を確認中のため、この追加操作はまだ利用できません。");
  }
  const policy = deriveOrganizationBillingPolicy(billingState.state);
  if (!policy.canWriteBusinessData) {
    throw new ConvexError("現在の契約状態では、この追加操作を行えません。");
  }

  const usage = await getOrganizationUsageSnapshot(ctx, args.organizationId, Date.now(), {
    excludedInvitationId: args.excludedInvitationId,
  });
  const projectedUsage = {
    peopleCount: usage.projectedPersonCount + (args.additionalPeople ?? 0),
    shopCount: usage.shopCount + (args.additionalShops ?? 0),
    activeManagerCount: usage.projectedActiveManagerCount + (args.additionalActiveManagers ?? 0),
  };
  const evaluation = evaluatePlanLimits(policy.entitlementPlan, projectedUsage);
  if (!evaluation.withinLimits) {
    const message = evaluation.violations.includes("people")
      ? `利用人数が現在のプラン上限を超えます。\n現在${usage.projectedPersonCount}名、上限${policy.limits.maxPeople}名です。`
      : evaluation.violations.includes("shops")
        ? "店舗数が現在のプラン上限を超えます。"
        : "招待中を含めた管理者の合計が、現在のプラン上限を超えます。";
    throw new ConvexError(message);
  }
  return { billingState, policy, usage };
}

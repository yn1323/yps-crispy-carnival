import type { OrganizationDisplayPlan, OrganizationEntitlementPlan, OrganizationPaidPlan } from "./planLimits";

export type OrganizationPlanPresentationKey = OrganizationDisplayPlan;

export const ORGANIZATION_PLAN_PRESENTATION = {
  trial: { label: "トライアル", sentenceLabel: "トライアル" },
  free: { label: "Free", sentenceLabel: "無料プラン" },
  pro: { label: "Standard", sentenceLabel: "Standard" },
  business: { label: "Pro", sentenceLabel: "Pro" },
} as const satisfies Record<OrganizationPlanPresentationKey, { label: string; sentenceLabel: string }>;

export function organizationPlanLabel(plan: OrganizationPlanPresentationKey): string {
  return ORGANIZATION_PLAN_PRESENTATION[plan].label;
}

export function organizationPlanSentenceLabel(plan: OrganizationPlanPresentationKey): string {
  return ORGANIZATION_PLAN_PRESENTATION[plan].sentenceLabel;
}

export function organizationPaidPlanLabel(plan: OrganizationPaidPlan): "Standard" | "Pro" {
  return ORGANIZATION_PLAN_PRESENTATION[plan].label;
}

export function organizationEntitlementPlanLabel(plan: OrganizationEntitlementPlan): "Free" | "Standard" | "Pro" {
  return ORGANIZATION_PLAN_PRESENTATION[plan].label;
}

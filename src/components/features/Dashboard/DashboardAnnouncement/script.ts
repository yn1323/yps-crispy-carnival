import type { OrganizationPlan } from "@/src/domains/shop/context";

type TargetedAnnouncement = {
  organizationId?: string;
  shopId?: string;
  organizationPlan?: string;
};

export type AnnouncementContext = {
  organizationId: string | null;
  shopId: string;
  organizationPlan: OrganizationPlan | null;
} | null;

function parseTargets(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  );
}

export function selectDashboardAnnouncementForContext<T extends TargetedAnnouncement>(
  announcements: readonly T[] | undefined,
  context: AnnouncementContext,
): T | null {
  if (!announcements) return null;

  return (
    announcements.find((announcement) => {
      const isGlobal =
        announcement.organizationId === undefined &&
        announcement.shopId === undefined &&
        announcement.organizationPlan === undefined;
      if (isGlobal) return true;
      if (!context) return false;

      const organizationIds = parseTargets(announcement.organizationId);
      const shopIds = parseTargets(announcement.shopId);
      const organizationPlans = parseTargets(announcement.organizationPlan);
      const matchesOrganization = context.organizationId !== null && organizationIds.includes(context.organizationId);
      const matchesShop = shopIds.includes(context.shopId);
      const matchesOrganizationPlan =
        context.organizationPlan !== null && organizationPlans.includes(context.organizationPlan);
      return matchesOrganization || matchesShop || matchesOrganizationPlan;
    }) ?? null
  );
}

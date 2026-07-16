type TargetedAnnouncement = {
  organizationId?: string;
  shopId?: string;
};

type AnnouncementContext = {
  organizationId: string | null;
  shopId: string;
} | null;

function parseTargetIds(value: string | undefined): string[] {
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
      const isGlobal = announcement.organizationId === undefined && announcement.shopId === undefined;
      if (isGlobal) return true;
      if (!context) return false;

      const organizationIds = parseTargetIds(announcement.organizationId);
      const shopIds = parseTargetIds(announcement.shopId);
      const matchesOrganization = context.organizationId !== null && organizationIds.includes(context.organizationId);
      const matchesShop = shopIds.includes(context.shopId);
      return matchesOrganization || matchesShop;
    }) ?? null
  );
}

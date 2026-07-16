type TargetedAnnouncement = {
  organizationId?: string;
  shopId?: string;
};

type AnnouncementContext = {
  organizationId: string | null;
  shopId: string;
} | null;

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

      const matchesOrganization =
        announcement.organizationId !== undefined && announcement.organizationId === context.organizationId;
      const matchesShop = announcement.shopId !== undefined && announcement.shopId === context.shopId;
      return matchesOrganization || matchesShop;
    }) ?? null
  );
}

import { Stack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { selectedShopAtom } from "@/src/stores/shop";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";
import { DashboardAnnouncementView } from "./DashboardAnnouncementView";
import { type AnnouncementContext, selectDashboardAnnouncementsForContext } from "./script";

export type DashboardAnnouncementState = {
  announcements: readonly DashboardAnnouncementData[];
  content: ReactNode;
};

type Props = {
  announcements?: readonly DashboardAnnouncementData[] | null;
  defaultOpen?: boolean;
  context?: AnnouncementContext;
  children?: (state: DashboardAnnouncementState) => ReactNode;
};

export const DashboardAnnouncement = ({ announcements, defaultOpen = false, context, children }: Props) => {
  const selectedShop = useAtomValue(selectedShopAtom);
  const queriedAnnouncements = useQuery(
    api.dashboard.queries.getActiveDashboardAnnouncementsV2,
    announcements === undefined ? {} : "skip",
  );
  const resolvedAnnouncements =
    announcements === undefined
      ? selectDashboardAnnouncementsForContext(queriedAnnouncements, context ?? selectedShop)
      : (announcements ?? []);
  const content =
    resolvedAnnouncements.length > 0 ? (
      <Stack gap={2}>
        {resolvedAnnouncements.map((announcement, index) => (
          <DashboardAnnouncementView
            key={announcement._id}
            announcement={announcement}
            defaultOpen={defaultOpen && index === 0}
          />
        ))}
      </Stack>
    ) : null;

  return children ? children({ announcements: resolvedAnnouncements, content }) : content;
};

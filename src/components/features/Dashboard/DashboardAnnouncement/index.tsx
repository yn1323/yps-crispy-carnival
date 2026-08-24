import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { selectedShopAtom } from "@/src/stores/shop";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";
import { DashboardAnnouncementView } from "./DashboardAnnouncementView";
import { type AnnouncementContext, selectDashboardAnnouncementForContext } from "./script";

export type DashboardAnnouncementState = {
  announcement: DashboardAnnouncementData | null;
  content: ReactNode;
};

type Props = {
  announcement?: DashboardAnnouncementData | null;
  defaultOpen?: boolean;
  context?: AnnouncementContext;
  children?: (state: DashboardAnnouncementState) => ReactNode;
};

export const DashboardAnnouncement = ({ announcement, defaultOpen = false, context, children }: Props) => {
  const selectedShop = useAtomValue(selectedShopAtom);
  const queriedAnnouncements = useQuery(
    api.dashboard.queries.getActiveDashboardAnnouncementsV2,
    announcement === undefined ? { planIdVersion: 2 } : "skip",
  );
  const resolvedAnnouncement =
    announcement === undefined
      ? selectDashboardAnnouncementForContext(queriedAnnouncements, context ?? selectedShop)
      : announcement;
  const content = resolvedAnnouncement ? (
    <DashboardAnnouncementView announcement={resolvedAnnouncement} defaultOpen={defaultOpen} />
  ) : null;

  return children ? children({ announcement: resolvedAnnouncement, content }) : content;
};

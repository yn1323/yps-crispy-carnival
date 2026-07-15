import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";
import { DashboardAnnouncementView } from "./DashboardAnnouncementView";

export type DashboardAnnouncementState = {
  announcement: DashboardAnnouncementData | null;
  content: ReactNode;
};

type Props = {
  announcement?: DashboardAnnouncementData | null;
  defaultOpen?: boolean;
  children?: (state: DashboardAnnouncementState) => ReactNode;
};

export const DashboardAnnouncement = ({ announcement, defaultOpen = false, children }: Props) => {
  const queriedAnnouncement = useQuery(
    api.dashboard.queries.getActiveDashboardAnnouncement,
    announcement === undefined ? {} : "skip",
  );
  const resolvedAnnouncement = announcement === undefined ? (queriedAnnouncement ?? null) : announcement;
  const content = resolvedAnnouncement ? (
    <DashboardAnnouncementView announcement={resolvedAnnouncement} defaultOpen={defaultOpen} />
  ) : null;

  return children ? children({ announcement: resolvedAnnouncement, content }) : content;
};

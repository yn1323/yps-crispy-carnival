import type { Id } from "@/convex/_generated/dataModel";

export type DashboardNotificationFailure = {
  _id: Id<"notificationFailureInbox">;
  staffName: string;
  notificationKind: "recruitment" | "reminder" | "confirmation" | "lineInvite" | "other";
  notificationKindLabel: string;
  periodLabel: string | null;
  channel?: "email" | "line";
  lastFailedAt: number;
  canRetry: boolean;
};

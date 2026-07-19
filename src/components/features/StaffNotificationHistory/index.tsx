import type { Id } from "@/convex/_generated/dataModel";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { StaffNotificationHistoryView } from "./StaffNotificationHistoryView";
import { useStaffNotificationHistory } from "./useStaffNotificationHistory";

type Props = {
  staffId: Id<"staffs">;
  enabled: boolean;
};

export function StaffNotificationHistory({ staffId, enabled }: Props) {
  return (
    <ErrorBoundary key={`${staffId}:${enabled}`} fallback={<StaffNotificationHistoryView items={[]} isError />}>
      <ConnectedStaffNotificationHistory staffId={staffId} enabled={enabled} />
    </ErrorBoundary>
  );
}

function ConnectedStaffNotificationHistory({ staffId, enabled }: Props) {
  const history = useStaffNotificationHistory(staffId, enabled);
  return <StaffNotificationHistoryView {...history} />;
}

export { StaffNotificationHistoryView } from "./StaffNotificationHistoryView";
export type { StaffNotificationHistoryItem } from "./script";

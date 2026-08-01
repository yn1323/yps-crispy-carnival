import type { Id } from "@/convex/_generated/dataModel";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { StaffNotificationHistoryView } from "./StaffNotificationHistoryView";
import { useStaffNotificationHistory } from "./useStaffNotificationHistory";

type Props = {
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
  enabled: boolean;
};

export function StaffNotificationHistory({ shopId, staffId, enabled }: Props) {
  return (
    <ErrorBoundary
      key={`${shopId}:${staffId}:${enabled}`}
      fallback={<StaffNotificationHistoryView items={[]} isError />}
    >
      <ConnectedStaffNotificationHistory shopId={shopId} staffId={staffId} enabled={enabled} />
    </ErrorBoundary>
  );
}

function ConnectedStaffNotificationHistory({ shopId, staffId, enabled }: Props) {
  const history = useStaffNotificationHistory(shopId, staffId, enabled);
  return <StaffNotificationHistoryView {...history} />;
}

export { StaffNotificationHistoryView } from "./StaffNotificationHistoryView";
export type { StaffNotificationHistoryItem } from "./script";

import type { Id } from "@/convex/_generated/dataModel";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { StaffNotificationHistoryView } from "./StaffNotificationHistoryView";
import { useStaffNotificationHistory } from "./useStaffNotificationHistory";

type Props = {
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
  enabled: boolean;
  lineConnectionStatus?: "linked" | "unlinked";
  expectedOrganizationId?: Id<"organizations">;
};

export function StaffNotificationHistory({
  shopId,
  staffId,
  enabled,
  lineConnectionStatus,
  expectedOrganizationId,
}: Props) {
  return (
    <ErrorBoundary
      key={`${shopId}:${staffId}:${enabled}`}
      fallback={<StaffNotificationHistoryView items={[]} isError lineConnectionStatus={lineConnectionStatus} />}
    >
      <ConnectedStaffNotificationHistory
        shopId={shopId}
        staffId={staffId}
        enabled={enabled}
        lineConnectionStatus={lineConnectionStatus}
        expectedOrganizationId={expectedOrganizationId}
      />
    </ErrorBoundary>
  );
}

function ConnectedStaffNotificationHistory({
  shopId,
  staffId,
  enabled,
  lineConnectionStatus,
  expectedOrganizationId,
}: Props) {
  const history = useStaffNotificationHistory(shopId, staffId, enabled, expectedOrganizationId);
  return <StaffNotificationHistoryView {...history} lineConnectionStatus={lineConnectionStatus} />;
}

export { StaffNotificationHistoryView } from "./StaffNotificationHistoryView";
export type { StaffNotificationHistoryItem } from "./script";

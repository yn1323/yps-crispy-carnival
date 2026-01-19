import { createFileRoute, useParams } from "@tanstack/react-router";
import { StaffingSettingsPage } from "@/src/components/pages/Shops/StaffingSettingsPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/shifts/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId } = useParams({ from: "/_auth/shops/$shopId/shifts/settings" });
  return (
    <Animation>
      <StaffingSettingsPage shopId={shopId} />
    </Animation>
  );
}

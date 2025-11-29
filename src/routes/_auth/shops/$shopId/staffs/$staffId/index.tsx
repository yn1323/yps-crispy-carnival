import { createFileRoute, useParams } from "@tanstack/react-router";
import { StaffDetailPage } from "@/src/components/pages/Shops/StaffDetailPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/staffs/$staffId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId, staffId } = useParams({ from: "/_auth/shops/$shopId/staffs/$staffId/" });

  return (
    <Animation>
      <StaffDetailPage shopId={shopId} staffId={staffId} />
    </Animation>
  );
}

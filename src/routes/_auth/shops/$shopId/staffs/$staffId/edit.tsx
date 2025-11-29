import { createFileRoute, useParams } from "@tanstack/react-router";
import { StaffEditPage } from "@/src/components/pages/Shops/StaffEditPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/staffs/$staffId/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId, staffId } = useParams({ from: "/_auth/shops/$shopId/staffs/$staffId/edit" });

  return (
    <Animation>
      <StaffEditPage shopId={shopId} staffId={staffId} />
    </Animation>
  );
}

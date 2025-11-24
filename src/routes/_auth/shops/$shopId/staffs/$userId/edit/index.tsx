import { createFileRoute } from "@tanstack/react-router";
import { StaffEditPage } from "@/src/components/pages/Staffs/EditPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/staffs/$userId/edit/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { userId, shopId } = Route.useParams();
  return (
    <Animation>
      <StaffEditPage userId={userId} shopId={shopId} />
    </Animation>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { MembersEditPage } from "@/src/components/pages/Members/EditPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/members/$userId/edit/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId, userId } = Route.useParams();
  return (
    <Animation>
      <MembersEditPage shopId={shopId} userId={userId} />
    </Animation>
  );
}

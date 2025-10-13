import { createFileRoute, useParams } from "@tanstack/react-router";
import { MembersDetailPage } from "@/src/components/pages/Members/DetailPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/members/$userId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId, userId } = useParams({ from: "/_auth/shops/$shopId/members/$userId/" });

  return (
    <Animation>
      <MembersDetailPage shopId={shopId} userId={userId} />
    </Animation>
  );
}

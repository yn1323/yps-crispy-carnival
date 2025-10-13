import { createFileRoute } from "@tanstack/react-router";
import { MembersDetailPage } from "@/src/components/pages/Members/DetailPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/members/$userId/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <MembersDetailPage />
    </Animation>
  );
}

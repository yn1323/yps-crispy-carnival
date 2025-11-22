import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/src/components/pages/Shops/InvitePage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/invite/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <InvitePage />
    </Animation>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { InviteShopMember } from "@/src/components/features/Shop/Invite";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/invite")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <InviteShopMember />
    </Animation>
  );
}

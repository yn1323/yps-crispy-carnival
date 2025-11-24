import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InviteShopStaffTabTypes } from "@/src/components/features/Shop/Invite";
import { InvitePage } from "@/src/components/pages/Shops/InvitePage";
import { Animation } from "@/src/components/templates/Animation";

const inviteSearchSchema = z.object({
  tab: z.enum(InviteShopStaffTabTypes).optional().catch(InviteShopStaffTabTypes[0]),
});

export const Route = createFileRoute("/_auth/shops/$shopId/invite/")({
  component: RouteComponent,
  validateSearch: (search) => inviteSearchSchema.parse(search),
});

function RouteComponent() {
  return (
    <Animation>
      <InvitePage />
    </Animation>
  );
}

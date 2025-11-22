import { createFileRoute, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { UserDetailTabTypes } from "@/src/components/features/User/UserDetail";
import { MembersDetailPage } from "@/src/components/pages/Members/DetailPage";
import { Animation } from "@/src/components/templates/Animation";

const userDetailSearchSchema = z.object({
  tab: z.enum(UserDetailTabTypes).optional().catch(UserDetailTabTypes[0]),
});

export const Route = createFileRoute("/_auth/shops/$shopId/members/$userId/")({
  component: RouteComponent,
  validateSearch: (search) => userDetailSearchSchema.parse(search),
});

function RouteComponent() {
  const { shopId, userId } = useParams({ from: "/_auth/shops/$shopId/members/$userId/" });

  return (
    <Animation>
      <MembersDetailPage shopId={shopId} userId={userId} />
    </Animation>
  );
}

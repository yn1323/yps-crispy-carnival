import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ShopDetailTabTypes } from "@/src/components/features/Shop/ShopDetail";
import { UserDetailTabTypes } from "@/src/components/features/User/UserDetail";
import { StaffDetailPage } from "@/src/components/pages/Staffs/DetailPage";
import { Animation } from "@/src/components/templates/Animation";

const userDetailSearchSchema = z.object({
  tab: z.enum(UserDetailTabTypes).optional().catch(UserDetailTabTypes[0]),
  fromTab: z.enum(ShopDetailTabTypes).optional(),
});

export const Route = createFileRoute("/_auth/shops/$shopId/staffs/$userId/")({
  component: () => {
    const { userId, shopId } = Route.useParams();
    return (
      <Animation>
        <StaffDetailPage userId={userId} shopId={shopId} />
      </Animation>
    );
  },
  validateSearch: (search) => userDetailSearchSchema.parse(search),
});

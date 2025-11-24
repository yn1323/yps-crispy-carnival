import { createFileRoute, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { ShopDetailTabTypes } from "@/src/components/features/Shop/ShopDetail";
import { ShopsDetailPage } from "@/src/components/pages/Shops/DetailPage";
import { Animation } from "@/src/components/templates/Animation";

const shopDetailSearchSchema = z.object({
  tab: z.enum(ShopDetailTabTypes).optional().catch(ShopDetailTabTypes[0]),
});

export const Route = createFileRoute("/_auth/shops/$shopId/")({
  component: RouteComponent,
  validateSearch: (search) => shopDetailSearchSchema.parse(search),
});

function RouteComponent() {
  const { shopId } = useParams({ from: "/_auth/shops/$shopId/" });

  return (
    <Animation>
      <ShopsDetailPage shopId={shopId} />
    </Animation>
  );
}

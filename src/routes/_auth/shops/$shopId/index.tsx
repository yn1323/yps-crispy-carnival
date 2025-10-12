import { createFileRoute, useParams } from "@tanstack/react-router";
import { ShopsDetailPage } from "@/src/components/pages/Shops/DetailPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId } = useParams({ from: "/_auth/shops/$shopId/" });

  return (
    <Animation>
      <ShopsDetailPage shopId={shopId} />
    </Animation>
  );
}

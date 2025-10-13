import { createFileRoute } from "@tanstack/react-router";
import { ShopsEditPage } from "@/src/components/pages/Shops/EditPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/edit/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId } = Route.useParams();
  return (
    <Animation>
      <ShopsEditPage shopId={shopId} />
    </Animation>
  );
}

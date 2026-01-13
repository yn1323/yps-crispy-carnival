import { createFileRoute, useParams } from "@tanstack/react-router";
import { ShiftsPage } from "@/src/components/pages/Shops/ShiftsPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/shifts/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId } = useParams({ from: "/_auth/shops/$shopId/shifts/" });
  return (
    <Animation>
      <ShiftsPage shopId={shopId} />
    </Animation>
  );
}

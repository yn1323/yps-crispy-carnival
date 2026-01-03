import { createFileRoute, useParams } from "@tanstack/react-router";
import { StaffsPage } from "@/src/components/pages/Shops/StaffsPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/staffs/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId } = useParams({ from: "/_auth/shops/$shopId/staffs/" });
  return (
    <Animation>
      <StaffsPage shopId={shopId} />
    </Animation>
  );
}

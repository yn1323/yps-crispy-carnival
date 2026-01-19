import { createFileRoute, useParams } from "@tanstack/react-router";
import { ShiftConfirmPage } from "@/src/components/pages/Shops/ShiftConfirmPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/shifts/recruitments/$recruitmentId/confirm")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId, recruitmentId } = useParams({
    from: "/_auth/shops/$shopId/shifts/recruitments/$recruitmentId/confirm",
  });
  return (
    <Animation>
      <ShiftConfirmPage shopId={shopId} recruitmentId={recruitmentId} />
    </Animation>
  );
}

import { createFileRoute, useParams } from "@tanstack/react-router";
import { RecruitmentDetailPage } from "@/src/components/pages/Shops/RecruitmentDetailPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/shifts/recruitments/$recruitmentId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId, recruitmentId } = useParams({
    from: "/_auth/shops/$shopId/shifts/recruitments/$recruitmentId/",
  });
  return (
    <Animation>
      <RecruitmentDetailPage shopId={shopId} recruitmentId={recruitmentId} />
    </Animation>
  );
}

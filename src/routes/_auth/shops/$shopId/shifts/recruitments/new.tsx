import { createFileRoute, useParams } from "@tanstack/react-router";
import { RecruitmentNewPage } from "@/src/components/pages/Shops/RecruitmentNewPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$shopId/shifts/recruitments/new")({
  component: RouteComponent,
});

function RouteComponent() {
  const { shopId } = useParams({ from: "/_auth/shops/$shopId/shifts/recruitments/new" });
  return (
    <Animation>
      <RecruitmentNewPage shopId={shopId} />
    </Animation>
  );
}

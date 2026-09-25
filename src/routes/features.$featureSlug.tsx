import { createFileRoute } from "@tanstack/react-router";
import { FeatureDetailPage } from "@/src/pages/features/detail";
import { buildFeatureDetailPageHead } from "@/src/pages/features/detailMeta";

export const Route = createFileRoute("/features/$featureSlug")({
  head: ({ params }) => buildFeatureDetailPageHead(params.featureSlug),
  component: FeatureDetailRoute,
});

function FeatureDetailRoute() {
  const { featureSlug } = Route.useParams();
  return <FeatureDetailPage slug={featureSlug} />;
}

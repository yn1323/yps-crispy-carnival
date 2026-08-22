import { createFileRoute } from "@tanstack/react-router";
import { HelpGuidePage } from "@/src/pages/help/guide";
import { buildHelpGuidePageHead } from "@/src/pages/help/guideMeta";

export const Route = createFileRoute("/help/$slug")({
  head: ({ params }) => buildHelpGuidePageHead(params.slug),
  component: HelpGuideRoute,
});

function HelpGuideRoute() {
  const { slug } = Route.useParams();
  return <HelpGuidePage slug={slug} />;
}

import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveLegacyHelpGuideHref } from "@/src/components/features/HelpCenter/helpAliases";
import { HelpGuidePage } from "@/src/pages/help/guide";
import { buildHelpGuidePageHead } from "@/src/pages/help/guideMeta";

export const Route = createFileRoute("/help/$slug")({
  beforeLoad: ({ params }) => {
    const href = resolveLegacyHelpGuideHref(params.slug);
    if (href) throw redirect({ href, replace: true });
  },
  head: ({ params }) => buildHelpGuidePageHead(params.slug),
  component: HelpGuideRoute,
});

function HelpGuideRoute() {
  const { slug } = Route.useParams();
  return <HelpGuidePage slug={slug} />;
}

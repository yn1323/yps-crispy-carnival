import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/src/pages/terms";
import { buildManagerTermsPageHead } from "@/src/pages/terms/meta";

export const Route = createFileRoute("/terms_/manager")({
  head: buildManagerTermsPageHead,
  component: ManagerTermsRoute,
});

function ManagerTermsRoute() {
  return <TermsPage audience="manager" />;
}

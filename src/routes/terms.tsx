import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/src/pages/terms";
import { buildGeneralTermsPageHead } from "@/src/pages/terms/meta";

export const Route = createFileRoute("/terms")({
  head: buildGeneralTermsPageHead,
  component: TermsPage,
});

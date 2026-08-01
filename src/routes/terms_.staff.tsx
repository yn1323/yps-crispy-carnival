import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/src/pages/terms";
import { buildStaffTermsPageHead } from "@/src/pages/terms/meta";

export const Route = createFileRoute("/terms_/staff")({
  head: buildStaffTermsPageHead,
  component: StaffTermsRoute,
});

function StaffTermsRoute() {
  return <TermsPage audience="staff" />;
}

import { createFileRoute } from "@tanstack/react-router";
import { StaffLegalConsentRoutePage } from "@/src/pages/staff-legal-consent";
import { buildStaffLegalConsentPageHead } from "@/src/pages/staff-legal-consent/meta";

export const Route = createFileRoute("/_unregistered/legal/staff/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: buildStaffLegalConsentPageHead,
  component: StaffLegalConsentRoute,
});

function StaffLegalConsentRoute() {
  const { token } = Route.useSearch();
  return <StaffLegalConsentRoutePage token={token} />;
}

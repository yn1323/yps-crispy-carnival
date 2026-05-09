import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffLegalConsentRoutePage } from "@/src/pages/staff-legal-consent";

export const Route = createFileRoute("/_unregistered/legal/staff/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "規約の確認", noindex: true }),
  }),
  component: StaffLegalConsentRoute,
});

function StaffLegalConsentRoute() {
  const { token } = Route.useSearch();
  return <StaffLegalConsentRoutePage token={token} />;
}

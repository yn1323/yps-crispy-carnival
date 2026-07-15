import { createFileRoute } from "@tanstack/react-router";
import { StaffRegistrationRoutePage } from "@/src/pages/staff-registration";
import { buildStaffRegistrationPageHead } from "@/src/pages/staff-registration/meta";

export const Route = createFileRoute("/_unregistered/staff/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: buildStaffRegistrationPageHead,
  component: StaffRegistrationRoute,
});

function StaffRegistrationRoute() {
  const { token } = Route.useSearch();
  return <StaffRegistrationRoutePage token={token} />;
}

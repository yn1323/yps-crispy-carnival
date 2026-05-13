import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffRegistrationRoutePage } from "@/src/pages/staff-registration";

export const Route = createFileRoute("/_unregistered/staff/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "スタッフ登録", noindex: true }),
  }),
  component: StaffRegistrationRoute,
});

function StaffRegistrationRoute() {
  const { token } = Route.useSearch();
  return <StaffRegistrationRoutePage token={token} />;
}

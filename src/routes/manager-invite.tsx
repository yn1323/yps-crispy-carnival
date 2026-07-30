import { createFileRoute } from "@tanstack/react-router";
import { ManagerInvitationRoutePage } from "@/src/pages/manager-invite";
import { buildManagerInvitationPageHead } from "@/src/pages/manager-invite/meta";

export const Route = createFileRoute("/manager-invite")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: buildManagerInvitationPageHead,
  component: ManagerInvitationRoute,
});

function ManagerInvitationRoute() {
  const { token } = Route.useSearch();
  return <ManagerInvitationRoutePage token={token} />;
}

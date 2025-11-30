import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/src/components/pages/Invite";

type InviteSearch = {
  token?: string;
};

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>): InviteSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { token } = Route.useSearch();
  return <InvitePage token={token ?? ""} />;
}

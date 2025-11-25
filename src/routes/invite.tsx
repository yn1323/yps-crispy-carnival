import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/src/components/pages/Invite";

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || "",
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { token } = Route.useSearch();
  return <InvitePage token={token} />;
}

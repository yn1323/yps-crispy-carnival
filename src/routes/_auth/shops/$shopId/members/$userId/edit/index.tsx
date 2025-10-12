import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/shops/$shopId/members/$userId/edit/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_auth/shops/$id/members/$id/edit/"!</div>;
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/shops/$id/members/new/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_auth/shops/$id/members/new/"!</div>;
}

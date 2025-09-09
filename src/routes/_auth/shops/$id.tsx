import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/shops/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_auth/shops/$id/"!</div>;
}

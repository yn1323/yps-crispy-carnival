import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/shops/$shopId/staffs/new/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_auth/shops/$id/staffs/new/"!</div>;
}

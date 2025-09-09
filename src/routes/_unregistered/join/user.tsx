import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_unregistered/join/user")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_unregistered/join/user"!</div>;
}

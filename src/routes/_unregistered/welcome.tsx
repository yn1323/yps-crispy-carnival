import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_unregistered/welcome")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_unregistered/welcome"!</div>;
}

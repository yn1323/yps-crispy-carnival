import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_unregistered")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}

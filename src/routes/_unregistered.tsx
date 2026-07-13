import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthProviders } from "@/src/providers/AuthProviders";

export const Route = createFileRoute("/_unregistered")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthProviders>
      <Outlet />
    </AuthProviders>
  );
}

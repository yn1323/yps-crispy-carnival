import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthProviders } from "@/src/components/config/AuthProviders";

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

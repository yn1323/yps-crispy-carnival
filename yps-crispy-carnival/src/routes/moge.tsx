import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/moge")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      oya moge
      <Outlet />
    </div>
  );
}

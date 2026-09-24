import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/features")({
  component: Outlet,
});

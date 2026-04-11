import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/src/components/ui/toaster";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
});

import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/src/components/ui/toaster";
import { sendPageView } from "@/src/helpers/gtm";

const PageViewTracker = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    sendPageView(pathname);
  }, [pathname]);

  return null;
};

export const Route = createRootRoute({
  component: () => (
    <>
      <PageViewTracker />
      <Outlet />
      <Toaster />
    </>
  ),
});

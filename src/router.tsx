import { createRouter } from "@tanstack/react-router";
import z from "zod";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { RouteErrorFallback } from "@/src/components/ui/ErrorBoundary";
import { customErrorMap } from "@/src/configs/zod/zop-setup.ts";
import { registerDialogBackNavigation } from "@/src/hooks/useCloseDialogOnBrowserBack";
import { routeTree } from "./routeTree.gen.ts";

z.config({ customError: customErrorMap });

/** Startはserver requestごとに独立したrouterを必要とするため、singletonにはしない。 */
export function getRouter() {
  const router = createRouter({
    routeTree,
    context: {},
    defaultPreload: "intent",
    scrollRestoration: true,
    trailingSlash: "never",
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: FullPageSpinner,
    defaultErrorComponent: RouteErrorFallback,
  });

  // Dialogの戻る操作はbrowser historyにだけ登録する。
  if (typeof window !== "undefined") {
    registerDialogBackNavigation(router.history);
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

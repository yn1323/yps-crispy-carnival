import { CatchBoundary, createRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import z from "zod";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { DocumentErrorFallback, RouteErrorFallback } from "@/src/components/ui/RouteErrorFallback";
import { customErrorMap } from "@/src/configs/zod/zop-setup.ts";
import { registerDialogBackNavigation } from "@/src/hooks/useCloseDialogOnBrowserBack";
import { routeTree } from "./routeTree.gen.ts";

z.config({ customError: customErrorMap });

function RouterErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <CatchBoundary getResetKey={() => "router"} errorComponent={DocumentErrorFallback}>
      {children}
    </CatchBoundary>
  );
}

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
    // 組み込みの最終fallbackも置き換え、root documentの失敗をChakraなしで表示する。
    disableGlobalCatchBoundary: true,
    Wrap: RouterErrorBoundary,
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

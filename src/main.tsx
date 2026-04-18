import { ClerkProvider } from "@clerk/clerk-react";
import { jaJP } from "@clerk/localizations";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import z from "zod";
import { ChakraProvider } from "@/src/components/config/ChakraProvider.tsx";
import { ConvexClientProvider } from "@/src/components/config/ConvexProvider.tsx";
import { customErrorMap } from "@/src/configs/zod/zop-setup.ts";
import { CLERK_PUBLISHABLE_KEY, CONVEX_URL, GTM_ID } from "@/src/constants/env";
import { initGTM } from "@/src/helpers/gtm";
import reportWebVitals from "./reportWebVitals.ts";
import { routeTree } from "./routeTree.gen.ts";

initGTM(GTM_ID);

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

z.config({ customError: customErrorMap });

// Render the app
const rootElement = document.getElementById("app");
const isPrerendering = (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ === true;
if (rootElement) {
  const tree = (
    <StrictMode>
      <ChakraProvider>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} localization={jaJP}>
          <ConvexClientProvider env={CONVEX_URL}>
            <RouterProvider router={router} />
          </ConvexClientProvider>
        </ClerkProvider>
      </ChakraProvider>
    </StrictMode>
  );
  if (!isPrerendering && rootElement.innerHTML) {
    // Prerender で生成された DOM の上にクライアントで hydrate する。
    // hydrate は既存 DOM をそのまま活かしつつイベントハンドラをアタッチするため FOUC もない。
    ReactDOM.hydrateRoot(rootElement, tree);
  } else {
    // 初回 prerender 実行時、または通常 SPA ルート(#app が空シェル) はそのまま mount。
    ReactDOM.createRoot(rootElement).render(tree);
  }
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

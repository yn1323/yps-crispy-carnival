import { ClerkProvider } from "@clerk/clerk-react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider } from "@/src/components/config/ChakraProvider.tsx";
import { ConvexClientProvider } from "@/src/components/config/ConvexProvider.tsx";
import { CLERK_PUBLISHABLE_KEY, CONVEX_URL } from "@/src/constants/env";
import reportWebVitals from "./reportWebVitals.ts";
import { routeTree } from "./routeTree.gen";

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

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <ChakraProvider>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
          <ConvexClientProvider env={CONVEX_URL}>
            <RouterProvider router={router} />
          </ConvexClientProvider>
        </ClerkProvider>
      </ChakraProvider>
    </StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

export const ConvexClientProvider = ({ children, env }: { children: ReactNode; env: string }) => {
  return (
    <ConvexProviderWithClerk client={getClient(env)} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
};

let convexClient: ConvexReactClient | null = null;

function getClient(env: string) {
  if (convexClient) {
    return convexClient;
  }

  convexClient = new ConvexReactClient(env);
  return convexClient;
}

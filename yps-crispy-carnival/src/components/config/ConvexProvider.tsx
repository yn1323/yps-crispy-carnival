"use client";

import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

if (!process.env.STORYBOOK_CONVEX_URL && !process.env.VITE_PUBLIC_CONVEX_URL) {
  throw new Error("Missing STORYBOOK_CONVEX_URL or VITE_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexReactClient(process.env.STORYBOOK_CONVEX_URL ?? process.env.VITE_PUBLIC_CONVEX_URL ?? "");

export const ConvexClientProvider = ({ children }: { children: ReactNode }) => {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
};

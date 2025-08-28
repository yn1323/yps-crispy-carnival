"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.STORYBOOK_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "");

export const ConvexClientProvider = ({ children }: { children: ReactNode }) => {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
};

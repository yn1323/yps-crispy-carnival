import { ClerkProvider as LibClerkProvider } from "@clerk/clerk-react";

// biome-ignore lint/suspicious/noExplicitAny: Storybook sends as Element
export const ClerkProvider = ({ children, env }: { children: any; env: string }) => {
  return <LibClerkProvider publishableKey={env}>{children}</LibClerkProvider>;
};

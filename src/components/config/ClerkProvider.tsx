import { ClerkProvider as LibClerkProvider } from "@clerk/clerk-react";

// Clerkのwarningをオフにする
const warn = console.warn;
console.warn = (...args) => {
  const clerkStartMsg = "Clerk: Clerk has been loaded with development keys.";
  if (typeof args[0] === "string" && args[0].startsWith(clerkStartMsg)) {
    return;
  }
  warn.apply(console, args);
};

// biome-ignore lint/suspicious/noExplicitAny: Storybook sends as Element
export const ClerkProvider = ({ children, env }: { children: any; env: string }) => {
  return (
    <LibClerkProvider publishableKey={env} afterSignOutUrl="/">
      {children}
    </LibClerkProvider>
  );
};

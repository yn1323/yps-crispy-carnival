import { Navigate } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = {
  children: ReactNode;
};

const isUnauthenticatedError = (error: Error) => error instanceof ConvexError && error.data === "Unauthenticated";

export const UnauthenticatedBoundary = ({ children }: Props) => {
  return (
    <ErrorBoundary
      fallback={(error) => {
        if (isUnauthenticatedError(error)) {
          return <Navigate to="/" replace />;
        }
        throw error;
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

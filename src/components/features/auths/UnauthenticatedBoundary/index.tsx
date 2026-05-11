import { Navigate, useRouterState } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { normalizeAuthRedirect } from "@/src/components/features/AuthPage/redirect";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = {
  children: ReactNode;
};

const isUnauthenticatedError = (error: Error) => error instanceof ConvexError && error.data === "Unauthenticated";

export const UnauthenticatedBoundary = ({ children }: Props) => {
  const location = useRouterState({ select: (state) => state.location });
  const redirect = normalizeAuthRedirect(`${location.pathname}${location.searchStr}`);

  return (
    <ErrorBoundary
      fallback={(error) => {
        if (isUnauthenticatedError(error)) {
          return <Navigate to="/login" search={{ redirect }} replace />;
        }
        throw error;
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

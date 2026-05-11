import { useAuth } from "@clerk/clerk-react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { normalizeAuthRedirect } from "@/src/components/features/AuthPage/redirect";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { userAtom } from "@/src/stores/user";

type Props = {
  children: React.ReactNode;
};

export const AuthGuard = ({ children }: Props) => {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const [user, setUser] = useAtom(userAtom);
  const currentUser = useQuery(api.dashboard.queries.getCurrentUser, isSignedIn ? {} : "skip");

  useEffect(() => {
    if (userId && currentUser) {
      setUser({
        authId: userId,
        name: currentUser.name ?? "",
        email: currentUser.email ?? "",
      });
    }
  }, [userId, currentUser, setUser]);

  if (user.authId) {
    return children;
  }

  if (!isLoaded) {
    return <FullPageSpinner />;
  }

  if (!isSignedIn) {
    return (
      <Navigate to="/login" search={{ redirect: normalizeAuthRedirect(`${location.pathname}${location.searchStr}`) }} />
    );
  }

  if (currentUser === undefined) {
    return <FullPageSpinner />;
  }

  return children;
};

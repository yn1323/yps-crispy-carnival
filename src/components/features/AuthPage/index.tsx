import { useAuth } from "@clerk/react";
import { Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import { AuthLoadingView } from "./AuthLoadingView";
import { ForgotPasswordFlow } from "./ForgotPasswordFlow";
import { LoginFlow } from "./LoginFlow";
import { SignupFlow } from "./SignupFlow";
import type { AuthMode } from "./types";

export type AuthPageProps = {
  mode: AuthMode;
  redirect?: string;
};

export function AuthPage({ mode, redirect }: AuthPageProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const redirectTo = useMemo(() => normalizeAuthRedirect(redirect), [redirect]);

  if (!isLoaded) {
    return <AuthLoadingView mode={mode} />;
  }

  if (isSignedIn) {
    return <Navigate to={redirectTo} replace />;
  }

  if (mode === "login") {
    return <LoginFlow redirectTo={redirectTo} />;
  }

  if (mode === "signup") {
    return <SignupFlow redirectTo={redirectTo} />;
  }

  return <ForgotPasswordFlow redirectTo={redirectTo} />;
}

export { SsoCallbackPage } from "./SsoCallback";
export type { AuthMode } from "./types";

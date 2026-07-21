import { AuthPage, SsoCallbackPage } from "@/src/components/features/AuthPage";
import { normalizeAuthRedirect } from "@/src/lib/auth/redirect";
import { AuthProviders } from "@/src/providers/AuthProviders";

type AuthRoutePageProps = {
  redirect?: string;
};

export function LoginPage({ redirect }: AuthRoutePageProps) {
  return (
    <AuthProviders>
      <AuthPage mode="login" redirect={redirect} />
    </AuthProviders>
  );
}

export function SignupPage({ redirect }: AuthRoutePageProps) {
  return (
    <AuthProviders>
      <AuthPage mode="signup" redirect={redirect} />
    </AuthProviders>
  );
}

export function ForgotPasswordPage({ redirect }: AuthRoutePageProps) {
  return (
    <AuthProviders>
      <AuthPage mode="forgot-password" redirect={redirect} />
    </AuthProviders>
  );
}

export function SsoCallbackRoutePage({ redirect }: AuthRoutePageProps) {
  const redirectTo = normalizeAuthRedirect(redirect);

  return (
    <AuthProviders>
      <SsoCallbackPage redirectTo={redirectTo} />
    </AuthProviders>
  );
}

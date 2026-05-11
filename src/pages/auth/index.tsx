import { AuthPage, SsoCallbackPage } from "@/src/components/features/AuthPage";

type AuthRoutePageProps = {
  redirect?: string;
};

export function LoginPage({ redirect }: AuthRoutePageProps) {
  return <AuthPage mode="login" redirect={redirect} />;
}

export function SignupPage({ redirect }: AuthRoutePageProps) {
  return <AuthPage mode="signup" redirect={redirect} />;
}

export function ForgotPasswordPage({ redirect }: AuthRoutePageProps) {
  return <AuthPage mode="forgot-password" redirect={redirect} />;
}

export function SsoCallbackRoutePage() {
  return <SsoCallbackPage />;
}

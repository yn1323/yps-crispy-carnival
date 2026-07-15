import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/src/pages/auth";
import { buildForgotPasswordPageHead } from "@/src/pages/auth/meta";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: buildForgotPasswordPageHead,
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const { redirect } = Route.useSearch();
  return <ForgotPasswordPage redirect={redirect} />;
}

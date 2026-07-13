import { createFileRoute } from "@tanstack/react-router";
import { SignupPage } from "@/src/pages/auth";
import { buildSignupPageHead } from "@/src/pages/auth/meta";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: buildSignupPageHead,
  component: SignupRoute,
});

function SignupRoute() {
  const { redirect } = Route.useSearch();
  return <SignupPage redirect={redirect} />;
}

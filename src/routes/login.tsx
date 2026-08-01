import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/src/pages/auth";
import { buildLoginPageHead } from "@/src/pages/auth/meta";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: buildLoginPageHead,
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <LoginPage redirect={redirect} />;
}

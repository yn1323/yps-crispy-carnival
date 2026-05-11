import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { LoginPage } from "@/src/pages/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "ログイン", noindex: true }),
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <LoginPage redirect={redirect} />;
}

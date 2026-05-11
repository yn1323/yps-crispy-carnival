import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { SignupPage } from "@/src/pages/auth";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "新規登録", noindex: true }),
  }),
  component: SignupRoute,
});

function SignupRoute() {
  const { redirect } = Route.useSearch();
  return <SignupPage redirect={redirect} />;
}

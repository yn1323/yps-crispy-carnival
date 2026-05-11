import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { ForgotPasswordPage } from "@/src/pages/auth";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "パスワード再設定", noindex: true }),
  }),
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const { redirect } = Route.useSearch();
  return <ForgotPasswordPage redirect={redirect} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { SsoCallbackRoutePage } from "@/src/pages/auth";
import { buildSsoCallbackPageHead } from "@/src/pages/auth/meta";

export const Route = createFileRoute("/sso-callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  head: buildSsoCallbackPageHead,
  component: SsoCallbackRoute,
});

function SsoCallbackRoute() {
  const { redirect } = Route.useSearch();
  return <SsoCallbackRoutePage redirect={redirect} />;
}

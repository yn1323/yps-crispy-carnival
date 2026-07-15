import { createFileRoute } from "@tanstack/react-router";
import { SsoCallbackRoutePage } from "@/src/pages/auth";
import { buildSsoCallbackPageHead } from "@/src/pages/auth/meta";

export const Route = createFileRoute("/sso-callback")({
  head: buildSsoCallbackPageHead,
  component: SsoCallbackRoutePage,
});

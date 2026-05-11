import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { SsoCallbackRoutePage } from "@/src/pages/auth";

export const Route = createFileRoute("/sso-callback")({
  head: () => ({
    meta: buildMeta({ title: "認証処理中", noindex: true }),
  }),
  component: SsoCallbackRoutePage,
});

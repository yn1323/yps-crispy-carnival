import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { LineCallbackRoutePage } from "@/src/pages/line-callback";

export const Route = createFileRoute("/_unregistered/line/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "LINE連携", noindex: true }),
  }),
  component: LineCallbackRoute,
});

function LineCallbackRoute() {
  const { code, state } = Route.useSearch();
  return <LineCallbackRoutePage code={code} state={state} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { LineCallbackRoutePage } from "@/src/pages/line-callback";
import { buildLineCallbackPageHead } from "@/src/pages/line-callback/meta";

export const Route = createFileRoute("/_unregistered/line/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
  }),
  head: buildLineCallbackPageHead,
  component: LineCallbackRoute,
});

function LineCallbackRoute() {
  const { code, state } = Route.useSearch();
  return <LineCallbackRoutePage code={code} state={state} />;
}

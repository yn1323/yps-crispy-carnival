import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { LineCallbackStatus } from "@/src/components/features/Line/LineCallbackPage";
import { LineCallbackPage } from "@/src/components/features/Line/LineCallbackPage";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { buildMeta } from "@/src/helpers/seo";

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
  const redeemLineToken = useAction(api.line.actions.redeemLineToken);
  const [status, setStatus] = useState<LineCallbackStatus>("loading");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!code || !state) {
      setStatus("expired");
      return;
    }
    redeemLineToken({ code, state })
      .then((r) => setStatus(r.status))
      .catch(() => setStatus("error"));
  }, [code, state, redeemLineToken]);

  return (
    <StaffLayout shopName="LINE連携">
      <LineCallbackPage status={status} />
    </StaffLayout>
  );
}

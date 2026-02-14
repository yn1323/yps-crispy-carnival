import { createFileRoute } from "@tanstack/react-router";
import { ShiftSubmitPage } from "@/src/components/pages/ShiftSubmit";

type ShiftSubmitSearch = {
  token?: string;
};

export const Route = createFileRoute("/shift-submit")({
  validateSearch: (search: Record<string, unknown>): ShiftSubmitSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { token } = Route.useSearch();
  return <ShiftSubmitPage token={token ?? ""} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { DemoStaffSubmitRoutePage } from "@/src/pages/demo-staff-submit";
import { buildDemoStaffSubmitPageHead } from "@/src/pages/demo-staff-submit/meta";

export const Route = createFileRoute("/shifts/demo-submit")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    start: typeof search.start === "string" ? search.start : undefined,
  }),
  head: buildDemoStaffSubmitPageHead,
  component: DemoStaffSubmitRoute,
});

function DemoStaffSubmitRoute() {
  const { start } = Route.useSearch();
  return <DemoStaffSubmitRoutePage periodStart={start} />;
}

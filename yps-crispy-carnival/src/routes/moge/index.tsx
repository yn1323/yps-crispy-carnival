import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/moge/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Ko moge</div>;
}

import { createFileRoute } from "@tanstack/react-router";
import { DemoFlowRoutePage } from "@/src/pages/demo-flow";
import { buildDemoFlowPageHead } from "@/src/pages/demo-flow/meta";

export const Route = createFileRoute("/demo/flow")({
  head: buildDemoFlowPageHead,
  component: DemoFlowRoutePage,
});

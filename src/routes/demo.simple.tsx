import { createFileRoute } from "@tanstack/react-router";
import { DemoSimpleRoutePage } from "@/src/pages/demo-handson";
import { buildDemoSimplePageHead } from "@/src/pages/demo-handson/meta";

export const Route = createFileRoute("/demo/simple")({
  head: buildDemoSimplePageHead,
  component: DemoSimpleRoutePage,
});

import { createFileRoute } from "@tanstack/react-router";
import { DemoDetailRoutePage } from "@/src/pages/demo-handson";
import { buildDemoDetailPageHead } from "@/src/pages/demo-handson/meta";

export const Route = createFileRoute("/demo/detail")({
  head: buildDemoDetailPageHead,
  component: DemoDetailRoutePage,
});

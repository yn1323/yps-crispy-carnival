import { createFileRoute } from "@tanstack/react-router";
import { HelpIndexPage } from "@/src/pages/help";
import { buildHelpIndexPageHead } from "@/src/pages/help/meta";

export const Route = createFileRoute("/help/")({
  head: buildHelpIndexPageHead,
  component: HelpIndexPage,
});

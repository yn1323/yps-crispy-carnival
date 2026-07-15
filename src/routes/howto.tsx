import { createFileRoute } from "@tanstack/react-router";
import { HowToPage } from "@/src/pages/howto";
import { buildHowToPageHead } from "@/src/pages/howto/meta";

export const Route = createFileRoute("/howto")({
  head: buildHowToPageHead,
  component: HowToPage,
});

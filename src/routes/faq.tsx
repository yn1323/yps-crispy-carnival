import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "@/src/pages/faq";
import { buildFaqPageHead } from "@/src/pages/faq/meta";

export const Route = createFileRoute("/faq")({
  head: buildFaqPageHead,
  component: FaqPage,
});

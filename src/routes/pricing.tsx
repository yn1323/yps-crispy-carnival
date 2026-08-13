import { createFileRoute } from "@tanstack/react-router";
import { PricingPage } from "@/src/pages/pricing";
import { buildPricingPageHead } from "@/src/pages/pricing/meta";

export const Route = createFileRoute("/pricing")({
  head: buildPricingPageHead,
  component: PricingPage,
});

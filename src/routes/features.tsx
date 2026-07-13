import { createFileRoute } from "@tanstack/react-router";
import { FeaturesPage } from "@/src/pages/features";
import { buildFeaturesPageHead } from "@/src/pages/features/meta";

export const Route = createFileRoute("/features")({
  head: buildFeaturesPageHead,
  component: FeaturesPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { Terms } from "@/src/components/features/Terms";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    links: buildLinks({ canonical: "/terms" }),
    meta: buildMeta({
      title: "利用規約",
      description: "シフトリの利用規約",
      canonical: "/terms",
      noindex: true,
    }),
  }),
  component: Terms,
});

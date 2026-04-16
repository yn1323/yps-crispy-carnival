import { createFileRoute } from "@tanstack/react-router";
import { Terms } from "@/src/components/features/Terms";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: buildMeta({
      title: "利用規約",
      description: "シフトリの利用規約",
      canonical: "/terms",
    }),
  }),
  component: Terms,
});

import { createFileRoute } from "@tanstack/react-router";
import { Terms } from "@/src/components/features/Terms";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/terms_/staff")({
  head: () => ({
    links: buildLinks({ canonical: "/terms/staff" }),
    meta: buildMeta({
      title: "スタッフ向け利用規約",
      description: "シフトリのスタッフ向け利用規約",
      canonical: "/terms/staff",
      noindex: true,
    }),
  }),
  component: StaffTermsRoute,
});

function StaffTermsRoute() {
  return <Terms audience="staff" />;
}

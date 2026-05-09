import { createFileRoute } from "@tanstack/react-router";
import { Terms } from "@/src/components/features/Terms";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/terms_/manager")({
  head: () => ({
    links: buildLinks({ canonical: "/terms/manager" }),
    meta: buildMeta({
      title: "管理ユーザー向け利用規約",
      description: "シフトリの管理ユーザー向け利用規約",
      canonical: "/terms/manager",
      noindex: true,
    }),
  }),
  component: ManagerTermsRoute,
});

function ManagerTermsRoute() {
  return <Terms audience="manager" />;
}

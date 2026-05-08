import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicy } from "@/src/components/features/PrivacyPolicy";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/privacy/manager")({
  head: () => ({
    links: buildLinks({ canonical: "/privacy/manager" }),
    meta: buildMeta({
      title: "管理ユーザー向けプライバシーポリシー",
      description: "シフトリの管理ユーザー向けプライバシーポリシー",
      canonical: "/privacy/manager",
      noindex: true,
    }),
  }),
  component: ManagerPrivacyRoute,
});

function ManagerPrivacyRoute() {
  return <PrivacyPolicy audience="manager" />;
}

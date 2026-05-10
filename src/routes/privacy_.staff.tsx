import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicy } from "@/src/components/features/PrivacyPolicy";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/privacy_/staff")({
  head: () => ({
    links: buildLinks({ canonical: "/privacy/staff" }),
    meta: buildMeta({
      title: "スタッフ向けプライバシーポリシー",
      description: "シフトリのスタッフ向けプライバシーポリシー",
      canonical: "/privacy/staff",
      noindex: true,
    }),
  }),
  component: StaffPrivacyRoute,
});

function StaffPrivacyRoute() {
  return <PrivacyPolicy audience="staff" />;
}

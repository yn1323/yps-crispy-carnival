import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicy } from "@/src/components/features/PrivacyPolicy";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    links: buildLinks({ canonical: "/privacy" }),
    meta: buildMeta({
      title: "プライバシーポリシー",
      description: "シフトリのプライバシーポリシー",
      canonical: "/privacy",
      noindex: true,
    }),
  }),
  component: PrivacyPolicy,
});

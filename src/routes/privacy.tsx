import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicy } from "@/src/components/features/PrivacyPolicy";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: buildMeta({
      title: "プライバシーポリシー",
      description: "シフトリのプライバシーポリシー",
      canonical: "/privacy",
    }),
  }),
  component: PrivacyPolicy,
});

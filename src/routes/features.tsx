import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { FeaturesPage } from "@/src/pages/features";

export const Route = createFileRoute("/features")({
  head: () => ({
    links: buildLinks({ canonical: "/features" }),
    meta: buildMeta({
      title: "シフトリでできること｜希望回収から確定通知まで",
      description:
        "シフトリでできることを紹介します。希望回収、未提出確認、シフト作成、LINE・メールでの確定通知まで、少人数のお店のシフト管理をひとつの流れで進められます。",
      canonical: "/features",
    }),
  }),
  component: FeaturesPage,
});

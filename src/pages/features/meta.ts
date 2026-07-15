import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildFeaturesPageHead() {
  return {
    links: buildLinks({ canonical: "/features" }),
    meta: buildMeta({
      title: "シフトリでできること｜希望回収から確定通知まで",
      description:
        "シフトリでできることを紹介します。希望回収、未提出確認、シフト作成、LINE・メールでの確定通知まで、ひとつの流れで進められます。",
      canonical: "/features",
    }),
  };
}

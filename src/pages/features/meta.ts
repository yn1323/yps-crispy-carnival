import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildFeaturesPageHead() {
  return {
    links: buildLinks({ canonical: "/features" }),
    meta: buildMeta({
      title: "シフトリでできること｜希望回収から確定通知まで",
      description:
        "シフトリでできることを紹介します。\n希望回収、シフト作成、確定通知に加え、組織、複数店舗、管理者、プランと支払いをまとめて管理できます。",
      canonical: "/features",
    }),
  };
}

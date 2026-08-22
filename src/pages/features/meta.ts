import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildFeaturesPageHead() {
  return {
    links: buildLinks({ canonical: "/features" }),
    meta: buildMeta({
      title: "シフトリでできること｜希望回収から確定通知まで",
      description:
        "シフトリでできることを紹介します。\n希望回収、未提出確認、シフト作成、確定通知までを一つの流れで進められます。複数店舗や複数のシフト担当者にも対応しています。",
      canonical: "/features",
    }),
  };
}

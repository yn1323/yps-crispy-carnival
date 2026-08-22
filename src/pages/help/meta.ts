import { createHelpFaqPageJsonLd } from "@/src/components/features/HelpCenter/helpMeta";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildHelpIndexPageHead() {
  return {
    links: buildLinks({ canonical: "/help" }),
    meta: [
      ...buildMeta({
        title: "ヘルプ｜シフトリ",
        description: "シフトリの操作方法、よくある質問、通知やトラブルへの対処を確認できます。",
        canonical: "/help",
      }),
      ...jsonLdMeta(createHelpFaqPageJsonLd()),
    ],
  };
}

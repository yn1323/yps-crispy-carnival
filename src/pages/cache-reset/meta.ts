import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildCacheResetPageHead() {
  return {
    links: buildLinks({ canonical: "/cache-reset" }),
    meta: [
      ...buildMeta({ title: "ページ情報の更新", canonical: "/cache-reset", noindex: true }),
      { name: "referrer", content: "no-referrer" },
    ],
  };
}

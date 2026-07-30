import { buildMeta } from "@/src/lib/seo";

export function buildNotFoundPageHead() {
  return {
    meta: [
      ...buildMeta({ title: "ページが見つかりません", noindex: true }),
      { name: "referrer", content: "no-referrer" },
    ],
  };
}

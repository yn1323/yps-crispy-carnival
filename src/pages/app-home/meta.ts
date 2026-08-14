import { buildMeta } from "@/src/lib/seo";

export function buildAppHomePageHead() {
  return {
    meta: [...buildMeta({ title: "ホーム", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

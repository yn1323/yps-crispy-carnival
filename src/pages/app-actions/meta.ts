import { buildMeta } from "@/src/lib/seo";

export function buildAppActionsPageHead() {
  return {
    meta: [...buildMeta({ title: "要対応", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

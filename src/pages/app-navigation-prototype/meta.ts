import { buildMeta } from "@/src/lib/seo";

export function buildAppPrototypePageHead(title: string) {
  return {
    meta: [...buildMeta({ title, noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

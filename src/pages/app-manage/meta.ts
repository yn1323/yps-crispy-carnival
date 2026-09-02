import { buildMeta } from "@/src/lib/seo";

export function buildAppManagePageHead(title = "管理") {
  return {
    meta: [...buildMeta({ title, noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

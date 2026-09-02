import { buildMeta } from "@/src/lib/seo";

export function buildAppStaffPageHead() {
  return {
    meta: [...buildMeta({ title: "スタッフ", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

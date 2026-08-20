import { buildMeta } from "@/src/lib/seo";

export function buildAppStaffOrderPageHead() {
  return {
    meta: [...buildMeta({ title: "スタッフの並び順", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

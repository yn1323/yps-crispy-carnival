import { buildMeta } from "@/src/lib/seo";

export function buildDashboardPageHead() {
  return {
    meta: [...buildMeta({ title: "ホーム", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

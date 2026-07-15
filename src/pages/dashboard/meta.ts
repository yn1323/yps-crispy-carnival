import { buildMeta } from "@/src/lib/seo";

export function buildDashboardPageHead() {
  return { meta: buildMeta({ title: "ダッシュボード", noindex: true }) };
}

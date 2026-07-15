import { buildMeta } from "@/src/lib/seo";

export function buildStaffShiftViewPageHead() {
  return { meta: buildMeta({ title: "シフト確認", noindex: true }) };
}

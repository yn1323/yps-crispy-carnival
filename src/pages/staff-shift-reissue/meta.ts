import { buildMeta } from "@/src/lib/seo";

export function buildStaffShiftReissuePageHead() {
  return { meta: buildMeta({ title: "シフト閲覧リンクの再発行", noindex: true }) };
}

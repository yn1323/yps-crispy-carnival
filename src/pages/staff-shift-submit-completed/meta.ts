import { buildMeta } from "@/src/lib/seo";

export function buildStaffShiftSubmitCompletedPageHead() {
  return { meta: buildMeta({ title: "シフト希望の提出完了", noindex: true }) };
}

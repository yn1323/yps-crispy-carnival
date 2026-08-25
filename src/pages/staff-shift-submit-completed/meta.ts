import { buildMeta } from "@/src/lib/seo";

export function buildStaffShiftSubmitCompletedPageHead() {
  return { meta: buildMeta({ title: "希望シフトの提出完了", noindex: true }) };
}

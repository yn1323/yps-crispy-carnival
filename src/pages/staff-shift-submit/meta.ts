import { buildMeta } from "@/src/lib/seo";

export function buildStaffShiftSubmitPageHead() {
  return { meta: buildMeta({ title: "希望シフト提出", noindex: true }) };
}

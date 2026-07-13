import { buildMeta } from "@/src/lib/seo";

export function buildShiftBoardPageHead() {
  return { meta: buildMeta({ title: "シフト表", noindex: true }) };
}

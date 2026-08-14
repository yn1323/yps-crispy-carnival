import { buildMeta } from "@/src/lib/seo";

export function buildAppShiftBoardPageHead() {
  return {
    meta: [...buildMeta({ title: "シフト表", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

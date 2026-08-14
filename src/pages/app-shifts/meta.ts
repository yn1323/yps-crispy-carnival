import { buildMeta } from "@/src/lib/seo";

export function buildAppShiftsPageHead() {
  return {
    meta: [...buildMeta({ title: "シフト", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

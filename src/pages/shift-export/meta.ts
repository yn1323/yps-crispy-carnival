import { buildMeta } from "@/src/lib/seo";

export function buildShiftExportPageHead() {
  return {
    meta: [...buildMeta({ title: "シフト表出力", noindex: true }), { name: "referrer", content: "no-referrer" }],
  };
}

import { buildMeta } from "@/src/lib/seo";

export function buildShiftSetupPageHead() {
  return { meta: buildMeta({ title: "シフト作成の設定", noindex: true }) };
}

import { buildMeta } from "@/src/lib/seo";

export function buildShiftSetupPageHead() {
  return { meta: buildMeta({ title: "必要人数設定", noindex: true }) };
}

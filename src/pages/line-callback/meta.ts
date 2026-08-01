import { buildMeta } from "@/src/lib/seo";

export function buildLineCallbackPageHead() {
  return { meta: buildMeta({ title: "LINE連携", noindex: true }) };
}

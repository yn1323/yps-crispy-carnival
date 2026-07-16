import { buildMeta } from "@/src/lib/seo";

export function buildShopSelectPageHead() {
  return { meta: buildMeta({ title: "店舗を選択", noindex: true }) };
}

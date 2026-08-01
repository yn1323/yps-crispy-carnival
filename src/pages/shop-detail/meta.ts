import { buildMeta } from "@/src/lib/seo";

export function buildShopDetailPageHead() {
  return { meta: buildMeta({ title: "店舗詳細", noindex: true }) };
}

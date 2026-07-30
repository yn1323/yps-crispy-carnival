import { buildMeta } from "@/src/lib/seo";

export function buildUserShopDetailPageHead() {
  return { meta: buildMeta({ title: "店舗別設定", noindex: true }) };
}

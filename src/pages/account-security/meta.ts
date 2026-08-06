import { buildMeta } from "@/src/lib/seo";

export function buildAccountSecurityPageHead() {
  return { meta: buildMeta({ title: "アカウント設定", noindex: true }) };
}

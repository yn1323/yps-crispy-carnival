import { buildMeta } from "@/src/lib/seo";

export function buildAccountSecurityPageHead() {
  return { meta: buildMeta({ title: "ログイン設定", noindex: true }) };
}
